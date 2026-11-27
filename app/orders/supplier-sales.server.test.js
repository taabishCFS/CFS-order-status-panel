import { describe, expect, it } from "vitest";
import { STORE, isReplacement, isStoreOrder, parseSupplierSalesParams, summarise } from "./supplier-sales.server.js";

const order = (n, over = {}) => ({ orderId: `o${n}`, name: `#10${n}`, createdAt: new Date(`2026-11-1${n}T10:00:00Z`), cancelledAt: null, orderStatusId: 4, site: "CFS", gateway: "card", sourceName: "web", serviceMinor: {}, totalMinor: 0, ...over });
const line = (orderId, vendor, priceMinor, quantity = 1, discountMinor = 0) => ({ orderId, vendor, priceMinor, quantity, discountMinor });
const p = { from: "2026-11-01", to: "2026-11-30", detail: true };

describe("params", () => {
  it("defaults to today and reads the breakup switch", () => {
    expect(parseSupplierSalesParams(new URLSearchParams("detail=1"), "2026-11-27")).toEqual({ from: "2026-11-27", to: "2026-11-27", detail: true });
    expect(parseSupplierSalesParams(new URLSearchParams("from=2026-11-30&to=2026-11-01"), "x")).toMatchObject({ from: "2026-11-01", to: "2026-11-30", detail: false });
  });
});

describe("rules", () => {
  it("spots replacement and store orders", () => {
    expect(isReplacement("#RCFS1001")).toBe(true);
    expect(isReplacement("#1001")).toBe(false);
    expect(isStoreOrder({ gateway: "PayByCardStore" })).toBe(true);
    expect(isStoreOrder({ gateway: "card", sourceName: "pos" })).toBe(true);
    expect(isStoreOrder({ gateway: "shopify_payments", sourceName: "web" })).toBe(false);
  });
});

describe("summarise", () => {
  it("adds up per site and brand, sharing delivery charges by the brand's lines", () => {
    const orders = [order(1, { serviceMinor: { two_man: 3000, reschedule: 2500 }, totalMinor: 13000 + 3000 + 2500 })];
    const lines = [line("o1", "Duke", 5000, 2), line("o1", "Kaye", 3000), line("o1", "Duke", 1000, 1, 1000)];
    const r = summarise(orders, lines, p);
    expect(r.sites).toHaveLength(1);
    const [duke, kaye] = r.sites[0].brands;
    expect(duke).toMatchObject({ brand: "Duke", saleMinor: 10000, grandMinor: 12000, units: 3 });
    expect(kaye).toMatchObject({ brand: "Kaye", saleMinor: 3000, grandMinor: 4000, units: 1 });
    expect(duke.orders[0]).toMatchObject({ split: true, parts: [{ label: "2Man", minor: 2000 }], diffMinor: 0 });
    expect(r.sites[0].totals).toEqual({ saleMinor: 13000, grandMinor: 16000, units: 4 });
  });
  it("leaves out cancelled, skipped-status and replacement orders; groups store orders and orders with no site", () => {
    const orders = [order(1, { cancelledAt: new Date() }), order(2, { orderStatusId: 15 }), order(3, { name: "#RCFS1" }), order(4, { gateway: "PayByCashStore", site: null, totalMinor: 1000 }), order(5, { site: null, totalMinor: 1000 })];
    const lines = ["o1", "o2", "o3", "o4", "o5"].map((id) => line(id, "Duke", 1000));
    const r = summarise(orders, lines, { ...p, detail: false });
    expect(r.sites.map((s) => s.site)).toEqual(["No site"]);
    expect(r.sites[0].brands.map((b) => [b.brand, b.store, b.saleMinor])).toEqual([["Duke", false, 1000], [STORE, true, 1000]]);
    expect(r.sites[0].brands[0].orders).toBeUndefined();
  });
  it("checks a single-brand order against its total (postage is not in the delivery shares, as the old page)", () => {
    const r = summarise([order(1, { totalMinor: 5500, shippingMinor: 500 })], [line("o1", "Duke", 5000)], p);
    expect(r.sites[0].brands[0].orders[0]).toMatchObject({ split: false, saleMinor: 5000, diffMinor: -500 });
  });
  it("shares a whole-order coupon or configuration change between the brands by their sales", () => {
    // lines 6000 + 3000 = 9000; total 8100 -> 900 off, shared 600 / 300
    const r = summarise([order(1, { totalMinor: 8100 })], [line("o1", "Duke", 6000), line("o1", "Kaye", 3000)], p);
    expect(r.sites[0].brands.map((b) => [b.brand, b.saleMinor])).toEqual([["Duke", 5400], ["Kaye", 2700]]);
    const single = summarise([order(2, { totalMinor: 10999 })], [line("o2", "Duke", 10000)], p);
    expect(single.sites[0].brands[0].orders[0]).toMatchObject({ saleMinor: 10999, diffMinor: 0 });
  });
});
