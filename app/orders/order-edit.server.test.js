import { describe, expect, it } from "vitest";
import { editOrder, findEdit, loadOrderState, markerFor, OrderEditError } from "./order-edit.server";

const ORDER = "gid://shopify/Order/1";
const LINE = "gid://shopify/LineItem/20326782501203";
const reply = (data) => ({ json: async () => ({ data }) });

// A fake Admin API that records calls and answers each order-edit mutation.
function shop({ fail = {}, order = null } = {}) {
  const calls = [];
  const graphql = async (query, { variables } = {}) => {
    const name = /(orderEdit\w+|query \w+)/.exec(query)?.[1] ?? "unknown";
    calls.push({ name, variables });
    if (fail[name] === "top") return { json: async () => ({ errors: [{ message: "Throttled" }] }) };
    const userErrors = fail[name] ? [{ field: ["x"], message: fail[name] }] : [];
    if (name === "orderEditBegin") return reply({ orderEditBegin: { calculatedOrder: { id: "gid://shopify/CalculatedOrder/9" }, userErrors } });
    if (name === "orderEditAddCustomItem") return reply({ orderEditAddCustomItem: { calculatedLineItem: { id: "c1" }, userErrors } });
    if (name === "orderEditAddLineItemDiscount") return reply({ orderEditAddLineItemDiscount: { addedDiscountStagedChange: { id: "d1" }, userErrors } });
    if (name === "orderEditCommit") return reply({ orderEditCommit: { order: { id: ORDER }, userErrors } });
    return reply({ order });
  };
  return { graphql, calls };
}
const args = (over = {}) => ({ orderId: ORDER, lineItemId: LINE, lineQuantity: 2, deltaMinor: 14000, currency: "GBP", title: "Configuration change v2: Fabric: Carlton Caramel", marker: markerFor(LINE, 2), note: "By Sam: asked", ...over });

describe("markerFor", () => {
  it("is short, readable and unique per line and version", () => {
    expect(markerFor(LINE, 2)).toBe("[cfg:20326782501203:v2]");
    expect(markerFor(LINE, 3)).not.toBe(markerFor(LINE, 2));
  });
});

describe("editOrder", () => {
  it("an increase adds one custom item for the difference, then commits without telling the customer", async () => {
    const { graphql, calls } = shop();
    const out = await editOrder(graphql, args());
    expect(calls.map((c) => c.name)).toEqual(["orderEditBegin", "orderEditAddCustomItem", "orderEditCommit"]);
    expect(calls[0].variables).toEqual({ id: ORDER });
    expect(calls[1].variables).toEqual({
      id: "gid://shopify/CalculatedOrder/9",
      title: "Configuration change v2: Fabric: Carlton Caramel [cfg:20326782501203:v2]",
      price: { amount: "140.00", currencyCode: "GBP" },
      quantity: 1,
      taxable: true,
      requiresShipping: false,
    });
    expect(calls[2].variables).toEqual({ id: "gid://shopify/CalculatedOrder/9", notifyCustomer: false, staffNote: "By Sam: asked [cfg:20326782501203:v2]" });
    expect(out).toEqual({ adjustment: { kind: "custom_item", amountMinor: 14000, currency: "GBP" } });
  });

  it("a decrease discounts the original line; Shopify applies a fixed discount per unit, so the amount is the difference divided by the line quantity", async () => {
    const { graphql, calls } = shop();
    const out = await editOrder(graphql, args({ deltaMinor: -14100 }));
    expect(calls.map((c) => c.name)).toEqual(["orderEditBegin", "orderEditAddLineItemDiscount", "orderEditCommit"]);
    expect(calls[1].variables).toEqual({
      id: "gid://shopify/CalculatedOrder/9",
      lineItemId: "gid://shopify/CalculatedLineItem/20326782501203",
      discount: { description: "Configuration change v2: Fabric: Carlton Caramel [cfg:20326782501203:v2]", fixedValue: { amount: "70.50", currencyCode: "GBP" } },
    });
    expect(out.adjustment).toEqual({ kind: "discount", amountMinor: 14100, currency: "GBP" });
  });

  it("refuses a decrease that does not divide evenly over the line quantity, without calling Shopify", async () => {
    const { graphql, calls } = shop();
    await expect(editOrder(graphql, args({ deltaMinor: -14101 }))).rejects.toBeInstanceOf(OrderEditError);
    expect(calls).toHaveLength(0);
  });

  it("refuses a zero difference without calling Shopify", async () => {
    const { graphql, calls } = shop();
    await expect(editOrder(graphql, args({ deltaMinor: 0 }))).rejects.toBeInstanceOf(OrderEditError);
    expect(calls).toHaveLength(0);
  });

  it("stops before committing when Shopify refuses a step, and says which", async () => {
    for (const [step, stage] of [["orderEditBegin", "begin"], ["orderEditAddCustomItem", "add"]]) {
      const { graphql, calls } = shop({ fail: { [step]: "Cannot edit" } });
      const err = await editOrder(graphql, args()).catch((e) => e);
      expect(err).toBeInstanceOf(OrderEditError);
      expect({ stage: err.stage, message: err.message }).toEqual({ stage, message: "Cannot edit" });
      expect(calls.some((c) => c.name === "orderEditCommit")).toBe(false);
    }
  });

  it("reports a failed commit", async () => {
    const { graphql } = shop({ fail: { orderEditCommit: "Order changed" } });
    const err = await editOrder(graphql, args()).catch((e) => e);
    expect({ stage: err.stage, message: err.message }).toEqual({ stage: "commit", message: "Order changed" });
  });

  it("treats a top-level GraphQL error as a failure", async () => {
    const { graphql } = shop({ fail: { orderEditBegin: "top" } });
    const err = await editOrder(graphql, args()).catch((e) => e);
    expect(err).toBeInstanceOf(OrderEditError);
    expect(err.message).toBe("Throttled");
  });
});

describe("findEdit", () => {
  const order = (nodes) => ({ lineItems: { nodes } });
  const item = (over = {}) => ({ id: "x", title: "Bed", discountAllocations: [], ...over });

  it("finds a committed custom item by its marker in the title", async () => {
    const { graphql } = shop({ order: order([item(), item({ title: `Config ${markerFor(LINE, 2)}` })]) });
    expect(await findEdit(graphql, { orderId: ORDER, marker: markerFor(LINE, 2) })).toBe(true);
  });

  it("finds a committed discount by its marker in the discount description", async () => {
    const allocation = { discountApplication: { title: null, description: `Config ${markerFor(LINE, 3)}` } };
    const { graphql } = shop({ order: order([item({ discountAllocations: [allocation] })]) });
    expect(await findEdit(graphql, { orderId: ORDER, marker: markerFor(LINE, 3) })).toBe(true);
  });

  it("does not match another version's marker, or an order without one", async () => {
    const { graphql } = shop({ order: order([item({ title: `Config ${markerFor(LINE, 2)}` })]) });
    expect(await findEdit(graphql, { orderId: ORDER, marker: markerFor(LINE, 3) })).toBe(false);
    expect(await findEdit(shop({ order: order([item()]) }).graphql, { orderId: ORDER, marker: markerFor(LINE, 2) })).toBe(false);
  });

  it("throws rather than guessing when Shopify cannot be read", async () => {
    const { graphql } = shop({ order: null });
    await expect(findEdit(graphql, { orderId: ORDER, marker: markerFor(LINE, 2) })).rejects.toBeInstanceOf(OrderEditError);
  });
});

describe("loadOrderState", () => {
  it("returns the currency, cancellation and each line's quantity and unfulfilled quantity", async () => {
    const { graphql } = shop({ order: { currencyCode: "GBP", cancelledAt: null, lineItems: { nodes: [{ id: LINE, quantity: 2, unfulfilledQuantity: 1 }] } } });
    expect(await loadOrderState(graphql, ORDER)).toEqual({ currency: "GBP", cancelledAt: null, lines: { [LINE]: { quantity: 2, unfulfilledQuantity: 1 } } });
  });

  it("throws when the order is not found", async () => {
    await expect(loadOrderState(shop({ order: null }).graphql, ORDER)).rejects.toBeInstanceOf(OrderEditError);
  });
});
