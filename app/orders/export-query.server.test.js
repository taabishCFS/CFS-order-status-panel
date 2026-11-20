import { describe, expect, it, vi } from "vitest";
import { buildExport, lookupCosts } from "./export-query.server.js";

const params = (over = {}) => ({ page: 1, all: false, brand: "Actona", from: null, to: null, q: "", statusId: null, takenBy: null, archived: false, insurance: false, ...over });
const stored = (n, over = {}) => ({
  orderId: "gid://shopify/Order/1", lineId: `gid://shopify/LineItem/${n}`, title: `Item ${n}`, sku: `S${n}`, vendor: "Actona", variantTitle: null,
  variantId: `gid://shopify/ProductVariant/${n}`, quantity: 1, priceMinor: 11999, discountMinor: 0, lineStatusId: 1, expectedDate: "2026-12-24",
  orderCreatedAt: new Date("2026-11-19T10:00:00Z"), ...over,
});
const fakeDb = (lines) => ({
  orderLine: { findMany: vi.fn(async () => lines) },
  order: { findMany: vi.fn(async () => [{ orderId: "gid://shopify/Order/1", name: "#1038" }]) },
});
const reply = (nodes) => vi.fn(async () => ({ json: async () => ({ data: { nodes } }) }));
const node = (n, cost, collections) => ({ id: `gid://shopify/ProductVariant/${n}`, inventoryItem: { unitCost: cost == null ? null : { amount: cost } }, product: { collections: { nodes: collections.map((title) => ({ title })) } } });

describe("lookupCosts", () => {
  it("maps cost in pence and joins the collection names, with null for no cost", async () => {
    const graphql = reply([node(1, "44.0", ["Actona Seaford", "Sale"]), node(2, null, []), null]);
    const map = await lookupCosts(graphql, ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2", "gid://shopify/ProductVariant/3"]);
    expect(map.get("gid://shopify/ProductVariant/1")).toEqual({ costMinor: 4400, range: "Actona Seaford / Sale" });
    expect(map.get("gid://shopify/ProductVariant/2")).toEqual({ costMinor: null, range: "" });
    expect(map.has("gid://shopify/ProductVariant/3")).toBe(false);
  });
  it("asks Shopify for at most 100 variants at a time", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `gid://shopify/ProductVariant/${i + 1}`);
    const graphql = reply([]);
    await lookupCosts(graphql, ids);
    expect(graphql).toHaveBeenCalledTimes(3);
    expect(graphql.mock.calls[0][1].variables.ids).toHaveLength(100);
  });
  it("throws when Shopify reports an error", async () => {
    const graphql = vi.fn(async () => ({ json: async () => ({ errors: [{ message: "Access denied" }] }) }));
    await expect(lookupCosts(graphql, ["gid://shopify/ProductVariant/1"])).rejects.toThrow("Access denied");
  });
});

describe("buildExport", () => {
  it("export 2 needs nothing from Shopify and carries the status label", async () => {
    const graphql = vi.fn();
    const res = await buildExport({ db: fakeDb([stored(1)]), graphql, shop: "s", params: params(), kind: 2 });
    expect(graphql).not.toHaveBeenCalled();
    expect(res.count).toBe(1);
    expect(res.csv.split("\r\n")[0]).toMatch(/^iOrderDetailId,Order Date,Order Number/);
    expect(res.csv.split("\r\n")[1]).toBe("1,19/11/2026,#1038,Item 1,S1,---,---,1,Payment Process,24/12/2026,,");
  });
  it("export 3 adds cost and range from Shopify", async () => {
    const res = await buildExport({ db: fakeDb([stored(1)]), graphql: reply([node(1, "44.0", ["Actona Seaford"])]), shop: "s", params: params(), kind: 3 });
    expect(res.costLookup).toBe("ok");
    expect(res.csv.split("\r\n")[1]).toBe("19/11/2026,#1038,Actona,Actona Seaford,Item 1,S1,,44,44.00,119.99,1,119.99,119.99,,Payment Process,24/12/2026");
  });
  it("export 3 still gives the file, with blank cost and range, when Shopify cannot be read", async () => {
    const graphql = vi.fn(async () => ({ json: async () => ({ errors: [{ message: "Access denied" }] }) }));
    const res = await buildExport({ db: fakeDb([stored(1)]), graphql, shop: "s", params: params(), kind: 3 });
    expect(res.costLookup).toBe("unavailable");
    expect(res.csv.split("\r\n")[1]).toBe("19/11/2026,#1038,Actona,,Item 1,S1,,,,119.99,1,119.99,119.99,,Payment Process,24/12/2026");
  });
  it("reads at most 5000 lines and says when the list was cut short", async () => {
    const db = fakeDb(Array.from({ length: 5001 }, (_, i) => stored(i + 1)));
    const res = await buildExport({ db, graphql: vi.fn(), shop: "s", params: params(), kind: 2 });
    expect(db.orderLine.findMany.mock.calls[0][0].take).toBe(5001);
    expect(res).toMatchObject({ count: 5000, capped: true });
  });
  it("filters like the list does and ignores the page", async () => {
    const db = fakeDb([]);
    await buildExport({ db, graphql: vi.fn(), shop: "s", params: params({ page: 4, brand: "Actona" }), kind: 2 });
    const args = db.orderLine.findMany.mock.calls[0][0];
    expect(args.where.AND).toContainEqual({ vendor: "Actona" });
    expect(args.skip).toBeUndefined();
  });
});
