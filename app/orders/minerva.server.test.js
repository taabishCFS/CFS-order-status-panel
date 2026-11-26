import { describe, expect, it } from "vitest";
import { listMinervaBrands, minervaCsv, minervaReport, parseMinervaParams, readMinervaInput, recordMinervaPayments, saveMinervaBrand } from "./minerva.server.js";

const SHOP = "s.myshopify.com";
const L = (n) => `gid://shopify/LineItem/${n}`;

function table(rows = []) {
  const match = (r, w = {}) => Object.entries(w).every(([k, v]) => {
    if (k === "shop_lineId") return r.shop === v.shop && r.lineId === v.lineId;
    if (k === "shop_brand") return r.shop === v.shop && r.brand === v.brand;
    if (v && typeof v === "object" && "in" in v) return v.in.includes(r[k]);
    if (v && typeof v === "object" && "not" in v) return r[k] !== v.not;
    if (v && typeof v === "object" && ("gte" in v || "lte" in v)) return (!v.gte || r[k] >= v.gte) && (!v.lte || r[k] <= v.lte);
    return r[k] === v;
  });
  return {
    rows,
    findMany: async ({ where } = {}) => rows.filter((r) => match(r, where)),
    upsert: async ({ where, create, update }) => { const r = rows.find((x) => match(x, where)); if (r) return Object.assign(r, update); rows.push({ ...create }); return create; },
    deleteMany: async ({ where }) => { const keep = rows.filter((r) => !match(r, where)); const n = rows.length - keep.length; rows.splice(0, rows.length, ...keep); return { count: n }; },
  };
}
const makeDb = () => ({ minervaBrand: table(), minervaPayment: table(), linePayment: table(), orderLine: table() });

describe("Minerva brands", () => {
  it("reads the brand settings", () => {
    expect(readMinervaInput({ op: "save", brand: " Ace ", disc: "2.5%", from: "2026-01-01", to: "2026-12-31" }).value).toEqual({ op: "save", brand: "Ace", discHundredths: 250, fromDate: "2026-01-01", toDate: "2026-12-31" });
    expect(readMinervaInput({ op: "save", brand: "Ace", disc: "60", from: "2026-01-01", to: "2026-12-31" }).error).toBe("bad_disc");
    expect(readMinervaInput({ op: "save", brand: "Ace", disc: "5", from: "2026-12-31", to: "2026-01-01" }).error).toBe("bad_date");
    expect(readMinervaInput({ op: "save", brand: "", disc: "5" }).error).toBe("brand_required");
    expect(readMinervaInput({ op: "delete", brand: "Ace" }).value).toEqual({ op: "delete", brand: "Ace" });
  });
  it("saves, lists and removes a brand", async () => {
    const db = makeDb();
    db.orderLine.rows.push({ shop: SHOP, vendor: "Zed" }, { shop: SHOP, vendor: "Ace" });
    await saveMinervaBrand(db, SHOP, { op: "save", brand: "Ace", discHundredths: 500, fromDate: "2026-01-01", toDate: "2026-06-30" }, { name: "Sam" });
    await saveMinervaBrand(db, SHOP, { op: "save", brand: "Ace", discHundredths: 300, fromDate: "2026-01-01", toDate: "2026-06-30" }, { name: "Sam" });
    expect(await listMinervaBrands(db, SHOP)).toEqual({ brands: [{ brand: "Ace", discHundredths: 300, fromDate: "2026-01-01", toDate: "2026-06-30", updatedByName: "Sam" }], allBrands: ["Ace", "Zed"] });
    expect(await saveMinervaBrand(db, SHOP, { op: "delete", brand: "Ace" })).toEqual({ ok: true, removed: 1 });
  });
});

describe("recording payments and the report", () => {
  const setup = async () => {
    const db = makeDb();
    db.minervaBrand.rows.push({ shop: SHOP, brand: "Ace", discHundredths: 500, fromDate: "2026-11-01", toDate: "2026-11-30" });
    db.linePayment.rows.push({ shop: SHOP, lineId: L(1), manualCostMinor: 10000 }, { shop: SHOP, lineId: L(2), manualCostMinor: 4000 });
    const lines = [{ lineId: L(1), orderId: "O1", vendor: "Ace" }, { lineId: L(2), orderId: "O2", vendor: "Ace" }, { lineId: L(3), orderId: "O3", vendor: "Other" }];
    return { db, lines };
  };
  it("Paid records Minerva lines once (paying again replaces), Not Paid removes them", async () => {
    const { db, lines } = await setup();
    expect(await recordMinervaPayments(db, SHOP, lines, true, new Date("2026-11-10T10:00:00Z"))).toBe(2);
    expect(await recordMinervaPayments(db, SHOP, lines.slice(0, 1), true, new Date("2026-12-05T10:00:00Z"))).toBe(1);
    expect(db.minervaPayment.rows).toHaveLength(2);
    expect(db.minervaPayment.rows[0]).toMatchObject({ lineId: L(1), brand: "Ace", paidMinor: 10000, discHundredths: 500, fromDate: "2026-11-01", toDate: "2026-11-30" });
    expect(await recordMinervaPayments(db, SHOP, lines.slice(1), false)).toBe(1);
    expect(db.minervaPayment.rows.map((r) => r.lineId)).toEqual([L(1)]);
  });
  it("adds up per brand: inside the dates is Applicable, outside is Not Applicable", async () => {
    const { db, lines } = await setup();
    await recordMinervaPayments(db, SHOP, lines.slice(0, 1), true, new Date("2026-12-05T10:00:00Z"));
    await recordMinervaPayments(db, SHOP, lines.slice(1, 2), true, new Date("2026-11-10T10:00:00Z"));
    const { rows } = await minervaReport(db, SHOP, {});
    expect(rows).toEqual([{ brand: "Ace", applicableMinor: 4000, notApplicableMinor: 10000, discHundredths: 500, lines: 2, amountMinor: 200, notEligibleMinor: 500 }]);
    expect((await minervaReport(db, SHOP, { from: "2026-12-01", to: "2026-12-31" })).rows[0]).toMatchObject({ applicableMinor: 0, notApplicableMinor: 10000 });
    expect(minervaCsv(rows).split("\r\n").slice(0, 2)).toEqual(["﻿Brand,Order Amount,Not Applicable Order Amount,Discount,Amount,Amount Not Eligible", "Ace,40.00,100.00,5,2.00,5.00"]);
  });
  it("reads the date filter", () => {
    expect(parseMinervaParams(new URLSearchParams("from=2026-12-31&to=2026-01-01"))).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseMinervaParams(new URLSearchParams("from=bad"))).toEqual({ from: "", to: "" });
  });
});
