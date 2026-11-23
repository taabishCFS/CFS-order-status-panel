import { describe, expect, it, vi } from "vitest";
import { changeProduct, searchVariants } from "./product-change.server";

const ORDER = "gid://shopify/Order/5";
const VARIANT = "gid://shopify/ProductVariant/9";
const money = (amount) => ({ shopMoney: { amount } });

function shopify(handlers) {
  const calls = [];
  const graphql = vi.fn(async (query, { variables }) => {
    const name = /(?:query|mutation)\s+(\w+)/.exec(query)[1];
    calls.push({ name, variables });
    return { json: async () => handlers[name](variables) };
  });
  return { graphql, calls };
}

const happy = (over = {}) => ({
  CfsReplacedLine: () => ({ data: { order: { cancelledAt: null, lineItems: { nodes: [{ id: "gid://shopify/LineItem/3", title: "Oslo Sideboard", variantTitle: "Oak", currentQuantity: 1, originalUnitPriceSet: money("119.99") }] } } } }),
  orderEditBegin: () => ({ data: { orderEditBegin: { calculatedOrder: { id: "CO1" }, userErrors: [] } } }),
  CfsAddVariant: () => ({ data: { orderEditAddVariant: { calculatedLineItem: { id: "CL9", title: "Bergen Table", variantTitle: "Default Title", quantity: 2, originalUnitPriceSet: money("120.00") }, userErrors: [] } } }),
  CfsRemoveLine: () => ({ data: { orderEditSetQuantity: { calculatedLineItem: { id: "CL3" }, userErrors: [] } } }),
  orderEditCommit: () => ({ data: { orderEditCommit: { order: { id: ORDER }, userErrors: [] } } }),
  ...over,
});

describe("searchVariants", () => {
  it("returns nothing for a blank search without asking Shopify", async () => {
    const { graphql } = shopify({});
    expect(await searchVariants(graphql, "  ")).toEqual([]);
    expect(graphql).not.toHaveBeenCalled();
  });
  it("maps the matching variants", async () => {
    const { graphql } = shopify({ CfsProductSearch: () => ({ data: { productVariants: { nodes: [{ id: VARIANT, title: "Oak", sku: "HN-1", price: "49.5", product: { title: "Oslo" } }] } } }) });
    expect(await searchVariants(graphql, "oslo")).toEqual([{ id: VARIANT, productTitle: "Oslo", variantTitle: "Oak", sku: "HN-1", priceMinor: 4950 }]);
  });
  it("throws when Shopify reports an error", async () => {
    const { graphql } = shopify({ CfsProductSearch: () => ({ errors: [{ message: "Throttled" }] }) });
    await expect(searchVariants(graphql, "x")).rejects.toThrow("Throttled");
  });
});

describe("changeProduct", () => {
  it("adds the product in one order edit, without emailing the customer", async () => {
    const { graphql, calls } = shopify(happy());
    const out = await changeProduct(graphql, { orderId: ORDER, variantId: VARIANT, quantity: 2, replaceLineItemId: null, note: "Product added by Sam" });
    expect(out).toEqual({ from: null, to: "Bergen Table x 2 = £240.00" });
    expect(calls.map((c) => c.name)).toEqual(["orderEditBegin", "CfsAddVariant", "orderEditCommit"]);
    expect(calls[1].variables).toEqual({ id: "CO1", variantId: VARIANT, quantity: 2 });
    expect(calls[2].variables).toEqual({ id: "CO1", notifyCustomer: false, staffNote: "Product added by Sam" });
  });
  it("swaps a line: adds the new product, takes the old one off, and reports both", async () => {
    const { graphql, calls } = shopify(happy());
    const out = await changeProduct(graphql, { orderId: ORDER, variantId: VARIANT, quantity: 2, replaceLineItemId: "gid://shopify/LineItem/3", note: "n" });
    expect(out).toEqual({ from: "Oslo Sideboard (Oak) x 1 = £119.99", to: "Bergen Table x 2 = £240.00" });
    expect(calls.map((c) => c.name)).toEqual(["CfsReplacedLine", "orderEditBegin", "CfsAddVariant", "CfsRemoveLine", "orderEditCommit"]);
    expect(calls[3].variables).toEqual({ id: "CO1", lineItemId: "gid://shopify/CalculatedLineItem/3", quantity: 0 });
  });
  it("refuses to swap a line that is gone or on a cancelled order, before any edit begins", async () => {
    const gone = shopify(happy({ CfsReplacedLine: () => ({ data: { order: { cancelledAt: null, lineItems: { nodes: [] } } } }) }));
    await expect(changeProduct(gone.graphql, { orderId: ORDER, variantId: VARIANT, quantity: 1, replaceLineItemId: "gid://shopify/LineItem/3", note: "n" })).rejects.toThrow(/no longer/);
    expect(gone.calls.map((c) => c.name)).toEqual(["CfsReplacedLine"]);
    const cancelled = shopify(happy({ CfsReplacedLine: () => ({ data: { order: { cancelledAt: "2026-11-01", lineItems: { nodes: [] } } } }) }));
    await expect(changeProduct(cancelled.graphql, { orderId: ORDER, variantId: VARIANT, quantity: 1, replaceLineItemId: "gid://shopify/LineItem/3", note: "n" })).rejects.toThrow(/cancelled/);
  });
  it("commits nothing when adding the product fails", async () => {
    const { graphql, calls } = shopify(happy({ CfsAddVariant: () => ({ data: { orderEditAddVariant: { calculatedLineItem: null, userErrors: [{ message: "Variant not found" }] } } }) }));
    await expect(changeProduct(graphql, { orderId: ORDER, variantId: VARIANT, quantity: 1, replaceLineItemId: null, note: "n" })).rejects.toThrow("Variant not found");
    expect(calls.map((c) => c.name)).not.toContain("orderEditCommit");
  });
});
