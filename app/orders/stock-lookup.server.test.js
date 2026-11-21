import { describe, expect, it, vi } from "vitest";
import { lookupStock } from "./stock-lookup.server";

const V = (n) => `gid://shopify/ProductVariant/${n}`;
const node = (n, over = {}) => ({ id: V(n), inventoryQuantity: 4, inventoryItem: { tracked: true }, product: { stock: { value: "IN STOCK" }, due: null }, ...over });
const reply = (nodes) => vi.fn(async () => ({ json: async () => ({ data: { nodes } }) }));

describe("lookupStock", () => {
  it("returns status, due date and inventory for each variant, asking for each variant once", async () => {
    const graphql = reply([node(1), node(2, { inventoryQuantity: 0, product: { stock: { value: "OUT OF STOCK" }, due: { value: "2026-12-25" } } })]);
    const found = await lookupStock(graphql, [V(1), V(2), V(1), null]);
    expect(graphql.mock.calls[0][1].variables.ids).toEqual([V(1), V(2)]);
    expect(found.get(V(1))).toEqual({ status: "IN STOCK", dueDate: null, inventory: 4, tracked: true });
    expect(found.get(V(2))).toEqual({ status: "OUT OF STOCK", dueDate: "2026-12-25", inventory: 0, tracked: true });
  });

  it("copes with a missing product, missing fields and a deleted variant", async () => {
    const graphql = reply([node(1, { product: null, inventoryItem: null, inventoryQuantity: null }), null]);
    const found = await lookupStock(graphql, [V(1), V(3)]);
    expect(found.get(V(1))).toEqual({ status: null, dueDate: null, inventory: null, tracked: false });
    expect(found.has(V(3))).toBe(false);
  });

  it("asks in batches of 100", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => V(i + 1));
    const graphql = vi.fn(async () => ({ json: async () => ({ data: { nodes: [] } }) }));
    await lookupStock(graphql, ids);
    expect(graphql.mock.calls.map((c) => c[1].variables.ids.length)).toEqual([100, 50]);
  });

  it("throws when Shopify reports an error, so the caller can leave the tint off", async () => {
    const graphql = vi.fn(async () => ({ json: async () => ({ errors: [{ message: "Access denied" }] }) }));
    await expect(lookupStock(graphql, [V(1)])).rejects.toThrow("Access denied");
  });
});
