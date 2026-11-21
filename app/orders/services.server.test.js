import { describe, expect, it, vi } from "vitest";
import { applyServices, readServices } from "./services.server";

const ORDER = "gid://shopify/Order/5";
const money = (amount) => ({ shopMoney: { amount, currencyCode: "GBP" } });

// Answers by the mutation or query name, recording what was asked.
function shopify(handlers) {
  const calls = [];
  const graphql = vi.fn(async (query, { variables }) => {
    const name = /(?:query|mutation)\s+(\w+)/.exec(query)[1];
    calls.push({ name, variables });
    return { json: async () => handlers[name](variables) };
  });
  return { graphql, calls };
}

describe("readServices", () => {
  it("finds the service lines by the marker in the title, ignoring removed ones", async () => {
    const { graphql } = shopify({
      CfsServices: () => ({ data: { order: { currencyCode: "GBP", lineItems: { nodes: [
        { id: "gid://shopify/LineItem/1", title: "Oslo Sideboard", currentQuantity: 1, originalUnitPriceSet: money("100.0") },
        { id: "gid://shopify/LineItem/2", title: "Two Man Delivery [svc:two_man]", currentQuantity: 1, originalUnitPriceSet: money("50.0") },
        { id: "gid://shopify/LineItem/3", title: "Scotland Delivery [svc:scotland]", currentQuantity: 0, originalUnitPriceSet: money("25.0") },
      ] } } } }),
    });
    expect(await readServices(graphql, ORDER)).toEqual({ currency: "GBP", services: { two_man: { lineItemId: "gid://shopify/LineItem/2", amountMinor: 5000 } } });
  });
  it("throws when the order is not found", async () => {
    const { graphql } = shopify({ CfsServices: () => ({ data: { order: null } }) });
    await expect(readServices(graphql, ORDER)).rejects.toThrow(/not found/i);
  });
});

describe("applyServices", () => {
  const ok = (field) => () => ({ data: { [field]: { userErrors: [], calculatedOrder: { id: "gid://shopify/CalculatedOrder/9" }, order: { id: ORDER }, calculatedLineItem: { id: "x" } } } });
  const handlers = () => ({
    orderEditBegin: ok("orderEditBegin"),
    CfsServiceRemove: ok("orderEditSetQuantity"),
    CfsServiceAdd: ok("orderEditAddCustomItem"),
    orderEditCommit: ok("orderEditCommit"),
  });

  it("does nothing, and does not call Shopify, when there is nothing to change", async () => {
    const { graphql } = shopify(handlers());
    expect(await applyServices(graphql, { orderId: ORDER, currency: "GBP", plan: { add: [], remove: [] }, note: "n" })).toEqual({ changed: false });
    expect(graphql).not.toHaveBeenCalled();
  });

  it("begins one edit, zeroes removed lines, adds new ones as taxable custom items, and commits without telling the customer", async () => {
    const { graphql, calls } = shopify(handlers());
    const res = await applyServices(graphql, { orderId: ORDER, currency: "GBP", plan: { add: [{ key: "two_man", amountMinor: 6000 }], remove: [{ key: "two_man", lineItemId: "gid://shopify/LineItem/2" }] }, note: "Services updated by Sam" });
    expect(res).toEqual({ changed: true });
    expect(calls.map((c) => c.name)).toEqual(["orderEditBegin", "CfsServiceRemove", "CfsServiceAdd", "orderEditCommit"]);
    expect(calls[1].variables).toMatchObject({ id: "gid://shopify/CalculatedOrder/9", lineItemId: "gid://shopify/CalculatedLineItem/2", quantity: 0 });
    expect(calls[2].variables).toMatchObject({ title: "Two Man Delivery [svc:two_man]", price: { amount: "60.00", currencyCode: "GBP" }, quantity: 1, taxable: true, requiresShipping: false });
    expect(calls[3].variables).toMatchObject({ notifyCustomer: false });
  });

  it("stops before committing when a step is refused, and names the step", async () => {
    const h = handlers();
    h.CfsServiceAdd = () => ({ data: { orderEditAddCustomItem: { userErrors: [{ message: "Cannot edit a cancelled order" }] } } });
    const { graphql, calls } = shopify(h);
    await expect(applyServices(graphql, { orderId: ORDER, currency: "GBP", plan: { add: [{ key: "two_man", amountMinor: 6000 }], remove: [] }, note: "n" })).rejects.toMatchObject({ message: "Cannot edit a cancelled order", stage: "add" });
    expect(calls.map((c) => c.name)).not.toContain("orderEditCommit");
  });
});
