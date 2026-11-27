import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_CATEGORY, NO_RANGE, clearCatalogCache, marketingQuery, parseMarketingParams, productCatalog, soldLines, summarise, withCatalog } from "./marketing-sales.server.js";

const sp = (q) => new URLSearchParams(q);
const P = (gid) => `gid://shopify/Product/${gid}`;
const item = (over = {}) => ({ orderId: "gid://shopify/Order/1", orderName: "#1001", placed: new Date("2026-11-20T10:00:00Z"), source: "Website", brand: "Duke", productId: P(7), title: "Bed", sku: "B1", units: 1, sales: 10000, ...over });

describe("parseMarketingParams", () => {
  it("defaults to this month up to today, by brand, highest sales first", () => {
    expect(parseMarketingParams(sp(""), "2026-11-27").value).toMatchObject({ from: "2026-11-01", to: "2026-11-27", group: "brand", sort: "sales", page: 1, status: 0, site: "" });
  });
  it("refuses reversed dates, an excluded status and a non-numeric product", () => {
    expect(parseMarketingParams(sp("from=2026-11-30&to=2026-11-01"), "x").error).toMatch(/start must not be after end/);
    expect(parseMarketingParams(sp("status=7"), "2026-11-27").error).toMatch(/cannot be included/);
    expect(parseMarketingParams(sp("product=abc"), "2026-11-27").error).toMatch(/number/);
  });
  it("round-trips through the query string", () => {
    const p = parseMarketingParams(sp("from=2026-11-01&to=2026-11-30&brand=Duke&status=4&group=product&sort=units"), "x").value;
    expect(parseMarketingParams(sp(marketingQuery(p)), "x").value).toEqual({ ...p, page: 1 });
  });
});

describe("soldLines", () => {
  it("keeps eligible orders and lines, leaves out replacements, and filters lines", async () => {
    const orderFind = vi.fn(async () => [
      { orderId: "gid://shopify/Order/1", name: "#1001", createdAt: new Date("2026-11-20T10:00:00Z"), orderSource: "Website" },
      { orderId: "gid://shopify/Order/2", name: "#RCFS1002", createdAt: new Date("2026-11-21T10:00:00Z"), orderSource: null },
    ]);
    const lineFind = vi.fn(async () => [{ orderId: "gid://shopify/Order/1", vendor: " Duke ", productId: P(7), title: "Bed", sku: "B1", quantity: 2, priceMinor: 5000, discountMinor: 500 }]);
    const db = { order: { findMany: orderFind }, orderLine: { findMany: lineFind } };
    const p = parseMarketingParams(sp("brand=Duke&search=bed&site=__unspecified__&status=4"), "2026-11-27").value;
    const { items } = await soldLines(db, "s", p);
    expect(items).toEqual([expect.objectContaining({ brand: "Duke", units: 2, sales: 9500, source: "Website" })]);
    const ow = orderFind.mock.calls[0][0].where;
    expect(ow).toMatchObject({ totalMinor: { gt: 0 }, cancelledAt: null, orderStatusId: 4, site: null });
    const lw = lineFind.mock.calls[0][0].where;
    expect(lw.orderId.in).toEqual(["gid://shopify/Order/1"]);
    expect(lw).toMatchObject({ vendor: "Duke", quantity: { gt: 0 } });
    expect(lw.AND[0].OR[0].title).toEqual({ contains: "bed", mode: "insensitive" });
  });

  it("finds items without a brand when Unmapped is chosen", async () => {
    const lineFind = vi.fn(async () => []);
    const db = { order: { findMany: async () => [{ orderId: "gid://shopify/Order/1", name: "#1001", createdAt: new Date(), orderSource: null }] }, orderLine: { findMany: lineFind } };
    await soldLines(db, "s", parseMarketingParams(sp("brand=Unmapped"), "2026-11-27").value);
    const w = lineFind.mock.calls[0][0].where;
    expect(w.vendor).toBeUndefined();
    expect(w.AND).toEqual([{ OR: [{ vendor: null }, { vendor: "" }] }]);
  });
});

describe("catalogue", () => {
  beforeEach(() => clearCatalogCache());
  it("reads collections and the category (or product type) once, then from memory", async () => {
    const graphql = vi.fn(async () => ({ json: async () => ({ data: { nodes: [{ id: P(7), productType: "Bed", category: null, collections: { nodes: [{ title: "Beds" }, { title: "Sale" }] } }] } }) }));
    const a = await productCatalog(graphql, "s", [P(7), P(8)], 1000);
    expect(a.get(P(7))).toMatchObject({ ranges: ["Beds", "Sale"], category: "Bed" });
    expect(a.get(P(8))).toMatchObject({ ranges: [], category: "" });
    await productCatalog(graphql, "s", [P(7)], 2000);
    expect(graphql).toHaveBeenCalledTimes(1);
  });
  it("filters by range and category, with fallbacks for unknown products", () => {
    const cat = new Map([[P(7), { ranges: ["Beds", "Sale"], category: "Furniture > Beds" }]]);
    const items = [item(), item({ productId: P(9) })];
    expect(withCatalog(items, cat, { range: "Sale", category: "" })).toHaveLength(1);
    expect(withCatalog(items, cat, { range: "", category: "" })[1]).toMatchObject({ ranges: [NO_RANGE], category: NO_CATEGORY });
  });
});

describe("summarise", () => {
  const items = withCatalog(
    [item(), item({ orderId: "gid://shopify/Order/2", orderName: "#1002", brand: "Kaye", productId: P(8), units: 3, sales: 3000, placed: new Date("2026-10-05T10:00:00Z") }), item({ units: 2, sales: 20000 })],
    new Map([[P(7), { ranges: ["Beds", "Sale"], category: "Beds" }]]),
    { range: "", category: "" },
  );
  it("adds up the totals and groups by brand, highest sales first", () => {
    const r = summarise(items, { group: "brand", sort: "sales" });
    expect(r.summary).toEqual({ orders: 2, units: 6, salesMinor: 33000, products: 2 });
    expect(r.rows.map((x) => [x.name, x.orders, x.units, x.salesMinor])).toEqual([["Duke", 1, 3, 30000], ["Kaye", 1, 3, 3000]]);
  });
  it("counts a product in two collections in both ranges, and sorts by name", () => {
    const r = summarise(items, { group: "range", sort: "name" });
    expect(r.rows.map((x) => [x.name, x.salesMinor])).toEqual([["Beds", 30000], [NO_RANGE, 3000], ["Sale", 30000]]);
  });
  it("groups by month, product and order", () => {
    expect(summarise(items, { group: "month", sort: "name" }).rows.map((x) => x.key)).toEqual(["2026-10", "2026-11"]);
    expect(summarise(items, { group: "product", sort: "units" }).rows[0]).toMatchObject({ key: "7", productId: "7", sku: "B1", units: 3 });
    expect(summarise(items, { group: "order", sort: "name" }).rows.map((x) => x.name)).toEqual(["#1002 | 05 Oct 2026", "#1001 | 20 Nov 2026"]);
  });
});
