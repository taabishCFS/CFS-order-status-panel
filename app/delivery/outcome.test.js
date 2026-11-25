import { beforeEach, describe, expect, it } from "vitest";
import { listOutcome, outcomeRows } from "./outcome.server.js";
import { matchesOutcomeSearch, outcomeCsv, parseOutcomeParams, partnerOf } from "./outcome-rules.js";

const SHOP = "s.myshopify.com";
const O = (n) => `gid://shopify/Order/${n}`;

function table(rows) {
  const match = (row, where = {}) => Object.entries(where).every(([k, v]) => (v !== null && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
  return { findMany: async ({ where, distinct, select } = {}) => {
    let out = rows.filter((r) => match(r, where));
    if (distinct) { const seen = new Set(); out = out.filter((r) => !seen.has(r[distinct[0]]) && seen.add(r[distinct[0]])); }
    return select ? out.map((r) => Object.fromEntries(Object.keys(select).map((k) => [k, r[k]]))) : out;
  } };
}
const order = (n, over = {}) => ({ shop: SHOP, orderId: O(n), name: `#${1000 + n}`, createdAt: new Date(Date.UTC(2026, 10, n, 12)), email: `c${n}@x.com`, postcode: `AB${n} 1CD`, gateway: n % 2 ? "kody" : "paypal", ...over });
const line = (n, over = {}) => ({ shop: SHOP, orderId: O(n), lineId: `L${n}`, title: "Bed", sku: `S${n}`, vendor: "Acme", quantity: 2, priceMinor: 10000, discountMinor: 500, lineStatusId: 6, ...over });
const booking = (n, over = {}) => ({ shop: SHOP, orderId: O(n), lineId: `L${n}`, partner: "CFS", date: "2026-11-25", vanId: "v1", driverId: null, ...over });

let db;
beforeEach(() => {
  db = {
    driver: table([{ id: "d1", shop: SHOP, name: "Driver1", active: true }]),
    van: table([{ id: "v1", shop: SHOP, name: "Van 1", driverId: "d1", active: true }]),
    deliverySlot: table([]),
    order: table([order(1), order(2), order(3), order(4)]),
    orderLine: table([line(1), line(2, { vendor: "Zed" }), line(3, { lineStatusId: 53 }), line(4, { lineStatusId: 54 })]),
    deliveryBooking: table([booking(1), booking(2, { partner: "TNT", date: null, vanId: null }), booking(3, { date: "2026-11-20" })]),
    deliveryHistory: table([{ shop: SHOP, orderId: O(3), lineId: "L3", reason: "Nobody home", createdAt: new Date() }]),
  };
});
const base = { kind: "completed", q: "", brand: null, van: null, pay: null, from: "", to: "", all: false, page: 1 };
const names = async (p) => (await outcomeRows(db, SHOP, { ...base, ...p })).map((r) => r.orderName);

describe("reading the filters", () => {
  it("reads kind, dates (swapped if backwards), van, pay and search", () => {
    expect(parseOutcomeParams(new URLSearchParams("kind=failed&from=2026-11-30&to=2026-11-01&van=partner:TNT&pay=kody&q=ab"))).toMatchObject({ kind: "failed", from: "2026-11-01", to: "2026-11-30", van: "partner:TNT", pay: "kody", q: "ab" });
    expect(parseOutcomeParams(new URLSearchParams("kind=zzz&from=bad")).kind).toBe("completed");
    expect(partnerOf("partner:TNT")).toBe("TNT");
    expect(partnerOf("partner:Evil")).toBeNull();
    expect(partnerOf("v1")).toBeNull();
  });
  it("search matches order number, postcode and email", () => {
    for (const q of ["1001", "#1001", "ab1", "c1@"]) expect(matchesOutcomeSearch(q, order(1))).toBe(true);
    expect(matchesOutcomeSearch("zzz", order(1))).toBe(false);
  });
});

describe("Completed list", () => {
  it("lists status 6 lines with their van, final value and pay mode", async () => {
    const rows = await outcomeRows(db, SHOP, base);
    expect(rows.map((r) => r.orderName)).toEqual(["#1001", "#1002"]);
    expect(rows[0]).toMatchObject({ van: "Van 1", driver: "Driver1", amountMinor: 19500, payMode: "kody", deliveryType: "Free Door Delivery" });
    expect(rows[1].van).toBe("TNT");
  });
  it("filters by date, a carrier (no date needed), brand and pay mode", async () => {
    expect(await names({ from: "2026-11-25", to: "2026-11-25" })).toEqual(["#1001"]);
    expect(await names({ van: "partner:TNT", from: "2026-01-01", to: "2026-01-02" })).toEqual(["#1002"]);
    expect(await names({ van: "v1" })).toEqual(["#1001"]);
    expect(await names({ brand: "Zed" })).toEqual(["#1002"]);
    expect(await names({ pay: "paypal" })).toEqual(["#1002"]);
  });
});

describe("Failed list", () => {
  it("lists status 53 and 54 lines, with the latest reason", async () => {
    const rows = await outcomeRows(db, SHOP, { ...base, kind: "failed" });
    expect(rows.map((r) => [r.orderName, r.statusLabel, r.reason])).toEqual([["#1003", "Failed Delivery", "Nobody home"], ["#1004", "Failed Collection", ""]]);
  });
});

describe("page and files", () => {
  it("returns the page with the vans and pay modes for the filters", async () => {
    const r = await listOutcome(db, SHOP, base);
    expect(r).toMatchObject({ total: 2, page: 1, pageCount: 1, vans: [{ id: "v1", name: "Van 1" }], payModes: ["kody", "paypal"] });
  });
  it("writes the completed and failed CSVs", async () => {
    const done = outcomeCsv("completed", await outcomeRows(db, SHOP, base)).slice(1).split("\r\n");
    expect(done[0]).toBe("Order Date,Order No.,Email,Brand,Item,Code,Qty,Delivery Date,Postcode,Van,Pay Mode,Final Value");
    expect(done[1]).toBe("01/11/2026,#1001,c1@x.com,Acme,Bed,S1,2,25/11/2026,AB1 1CD,Van 1,kody,195.00");
    const failed = outcomeCsv("failed", await outcomeRows(db, SHOP, { ...base, kind: "failed" })).slice(1).split("\r\n");
    expect(failed[0]).toBe("Order Date,Order No.,Brand,Item,Code,Qty,Delivery Date,Driver,Reason,Delivery Type,Status");
    expect(failed[1]).toContain("Nobody home");
  });
});
