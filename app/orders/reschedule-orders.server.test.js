import { describe, expect, it } from "vitest";
import { listReschedules, parseRescheduleParams, rescheduleCsv } from "./reschedule-orders.server.js";

const SHOP = "s.myshopify.com";
const L = (n) => `gid://shopify/LineItem/${n}`;
const O = (n) => `gid://shopify/Order/${n}`;
function makeDb(charges, lines, orders) {
  const hit = (w = {}) => (r) => Object.entries(w).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in v) return v.in.includes(r[k]);
    if (v && typeof v === "object" && "gt" in v) return r[k] > v.gt;
    return r[k] === v;
  });
  return {
    lineReschedule: { findMany: async ({ where }) => charges.filter(hit(where)) },
    orderLine: { findMany: async ({ where }) => lines.filter(hit(where)) },
    order: { findMany: async ({ where }) => orders.filter(hit(where)) },
  };
}
const line = (n, extra = {}) => ({ shop: SHOP, orderId: O(n), lineId: L(n), vendor: n % 2 ? "Ace" : "Best", title: `Bed ${n}`, variantTitle: "", priceMinor: 10000, quantity: 1, lineStatusId: 4, orderCreatedAt: new Date(`2026-11-${10 + n}T10:00:00Z`), ...extra });
const charge = (n, chargeMinor = 1000, count = 1) => ({ shop: SHOP, lineId: L(n), orderId: O(n), chargeMinor, count });
const orders = [1, 2, 3, 4, 5].map((n) => ({ shop: SHOP, orderId: O(n), name: `#CFS${n}` }));

describe("Reschedule Delivery Orders", () => {
  it("reads the filters", () => {
    expect(parseRescheduleParams(new URLSearchParams("brand=Ace&from=2026-11-30&to=2026-11-01&q=bed&lines=x," + L(1)))).toMatchObject({ brand: "Ace", from: "2026-11-01", to: "2026-11-30", q: "bed", lines: [L(1)] });
  });
  it("lists rescheduled lines (charged or not) newest first, leaving out cancelled and deleted lines", async () => {
    const db = makeDb([charge(1, 0), charge(2, 2000, 2), charge(3), charge(4), charge(5, 0, 0)], [line(1), line(2), line(3, { lineStatusId: 7 }), line(4, { lineStatusId: 9 }), line(5)], orders);
    const r = await listReschedules(db, SHOP, {});
    expect(r.rows.map((x) => x.lineId)).toEqual([L(2), L(1)]);
    expect(r.rows[0]).toMatchObject({ orderName: "CFS2", brand: "Best", priceMinor: 10000, chargeMinor: 2000, count: 2 });
    expect(r.brands).toEqual(["Ace", "Best"]);
  });
  it("filters by brand, order date and search", async () => {
    const db = makeDb([charge(1), charge(2), charge(5)], [line(1), line(2), line(5)], orders);
    expect((await listReschedules(db, SHOP, { brand: "Ace" })).rows.map((x) => x.lineId)).toEqual([L(5), L(1)]);
    expect((await listReschedules(db, SHOP, { from: "2026-11-12", to: "2026-11-14" })).rows.map((x) => x.lineId)).toEqual([L(2)]);
    expect((await listReschedules(db, SHOP, { q: "cfs5" })).rows.map((x) => x.lineId)).toEqual([L(5)]);
    expect((await listReschedules(db, SHOP, { q: "bed 1" })).total).toBe(1);
  });
  it("is empty when nothing was rescheduled", async () => {
    expect(await listReschedules(makeDb([], [], []), SHOP, {})).toMatchObject({ rows: [], total: 0 });
  });
  it("downloads the old columns", async () => {
    const r = await listReschedules(makeDb([charge(1, 2469, 1)], [line(1, { variantTitle: "Double", title: "Bed, \"Oak\"" })], orders), SHOP, {});
    expect(rescheduleCsv(r.rows).split("\r\n").slice(0, 2)).toEqual(["﻿Order Number,Product Name,Brand Name,Price,Reschedule Charge,Reschedule Count", 'CFS1,"Bed, ""Oak"" - Double",Ace,100.00,24.69,1']);
  });
});
