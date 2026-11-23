import { describe, expect, it } from "vitest";
import { gqlLine, gqlOrder } from "./fixtures.js";
import { mapOrder, siteOf } from "./map-order.js";

const money = (amount) => ({ shopMoney: { amount, currencyCode: "GBP" } });

describe("mapOrder service and configuration lines", () => {
  it("leaves out [svc:] and [cfg:] custom lines", () => {
    const o = gqlOrder();
    o.lineItems.nodes.push(gqlLine(88, { title: "Configuration change v2: Size: King [cfg:1:v2]" }), gqlLine(89, { title: "Two Man Delivery [svc:two_man]" }));
    const { lines } = mapOrder("s.myshopify.com", o);
    expect(lines.map((l) => l.lineId)).not.toContain("gid://shopify/LineItem/88");
    expect(lines.length).toBe(gqlOrder().lineItems.nodes.length);
  });
});

describe("mapOrder after an order edit", () => {
  it("uses the current amounts, not the ones the order was placed at", () => {
    const { order } = mapOrder("s.myshopify.com", gqlOrder({ currentTotalPriceSet: money("293.0"), currentSubtotalPriceSet: money("273.0"), currentShippingPriceSet: money("20.0"), currentTotalDiscountsSet: money("0.0") }));
    expect(order.total.minor).toBe(29300);
    expect(order.subtotal.minor).toBe(27300);
  });
});

describe("mapOrder", () => {
  it("turns money strings into minor units with the currency", () => {
    const { order, lines } = mapOrder("s.myshopify.com", gqlOrder());
    expect(order.total).toEqual({ minor: 29900, currency: "GBP" });
    expect(order.shipping).toEqual({ minor: 2000, currency: "GBP" });
    expect(lines[0].price).toEqual({ minor: 27900, currency: "GBP" });
  });

  it("keeps the discount on the order and on each line", () => {
    const { order, lines } = mapOrder("s", gqlOrder({ totalDiscountsSet: money("10.5"), lineItems: { nodes: [gqlLine(1, { totalDiscountSet: money("10.5") })] } }));
    expect(order.discount.minor).toBe(1050);
    expect(lines[0].discount.minor).toBe(1050);
  });

  it("keeps line properties as a list of key and value pairs", () => {
    const { lines } = mapOrder("s", gqlOrder());
    expect(lines[0].properties).toEqual([{ key: "Size", value: "2ft 6in" }]);
    expect(lines[0]).toMatchObject({ lineId: "gid://shopify/LineItem/1", sku: "SKU-1", quantity: 1 });
  });

  it("does not copy delivery service charges (lines marked [svc:...]) as products", () => {
    const { lines } = mapOrder("s", gqlOrder({ lineItems: { nodes: [gqlLine(1), gqlLine(2, { title: "Two Man Delivery [svc:two_man]" })] } }));
    expect(lines.map((l) => l.lineId)).toEqual(["gid://shopify/LineItem/1"]);
  });

  it("keeps the vendor (the legacy brand) and variant title on each line", () => {
    const { lines } = mapOrder("s", gqlOrder());
    expect(lines[0]).toMatchObject({ vendor: "Duke Beds", variantTitle: "2ft 6in" });
  });

  it("keeps the product and variant ids, and null for a custom item with neither", () => {
    const { lines } = mapOrder("s", gqlOrder({ lineItems: { nodes: [gqlLine(1), gqlLine(2, { product: null, variant: null })], pageInfo: { hasNextPage: false, endCursor: null } } }));
    expect(lines[0]).toMatchObject({ productId: "gid://shopify/Product/500", variantId: "gid://shopify/ProductVariant/600" });
    expect(lines[1]).toMatchObject({ productId: null, variantId: null });
  });

  it("takes the customer name from the shipping address, or the billing address when there is none", () => {
    expect(mapOrder("s", gqlOrder()).order.customerName).toBe("Alex Customer");
    const billingOnly = gqlOrder({ shippingAddress: null, billingAddress: { name: "Bill Payer" } });
    expect(mapOrder("s", billingOnly).order.customerName).toBe("Bill Payer");
  });

  it("maps a guest order with no customer and no email", () => {
    const { order } = mapOrder("s", gqlOrder({ email: null, shippingAddress: null, billingAddress: null }));
    expect(order).toMatchObject({ email: null, customerName: null, shippingAddress: null });
  });

  it("carries the identifiers, dates, tags and site", () => {
    const { order } = mapOrder("shop.test", gqlOrder({ cancelledAt: "2026-11-20T09:00:00Z" }));
    expect(order).toMatchObject({ shop: "shop.test", orderId: "gid://shopify/Order/1", name: "#1036", site: "CFS", tags: ["site:CFS"], financialStatus: "PAID" });
    expect(order.shopifyUpdatedAt).toEqual(new Date("2026-11-19T10:00:00Z"));
    expect(order.cancelledAt).toEqual(new Date("2026-11-20T09:00:00Z"));
  });
});

describe("siteOf", () => {
  it("lets a site tag win", () => {
    expect(siteOf({ sourceName: "ebay", tags: ["x", "site:TFS"] })).toBe("TFS");
  });
  it("maps an eBay source", () => {
    expect(siteOf({ sourceName: "eBay Marketplace", tags: [] })).toBe("eBay");
  });
  it("returns null when nothing says which site", () => {
    expect(siteOf({ sourceName: "web", tags: ["vip"] })).toBeNull();
    expect(siteOf({ sourceName: null, tags: [] })).toBeNull();
  });
  it("ignores a site tag that is not one of the six sites", () => {
    expect(siteOf({ sourceName: "web", tags: ["site:XYZ"] })).toBeNull();
  });
});

describe("mapOrder list fields", () => {
  const status = JSON.stringify({ order: { statusId: 3 }, lines: { "gid://shopify/LineItem/1": { statusId: 4 } }, expected: { "gid://shopify/LineItem/1": { date: "2026-12-10" } }, history: [] });
  const base = (over = {}) => gqlOrder({
    paymentGatewayNames: ["kody", "shopify"],
    phone: "0777",
    shippingAddress: { name: "Alex", zip: "LE1 3LR", phone: "0116" },
    totalOutstandingSet: money("50.0"),
    totalRefundedSet: money("5.0"),
    tags: ["site:CFS", "taken-by: ABEER ", "source:Leicester"],
    metafield: { value: status },
    ...over,
  });

  it("maps gateway, balance, refunds, phone, postcode, taker and source", () => {
    const { order } = mapOrder("s", base());
    expect(order).toMatchObject({ gateway: "kody", outstanding: { minor: 5000 }, refunded: { minor: 500 }, phone: "0116", postcode: "LE1 3LR", orderTakenBy: "ABEER", orderSource: "Leicester", orderStatusId: 3 });
  });

  it("falls back to the order phone and leaves absent fields null", () => {
    const { order } = mapOrder("s", base({ shippingAddress: { name: "A" }, paymentGatewayNames: [], tags: [] }));
    expect(order).toMatchObject({ phone: "0777", postcode: null, gateway: null, orderTakenBy: null, orderSource: null });
  });

  it("lists distinct brands (blank as Unmapped) and distinct line statuses", () => {
    const { order } = mapOrder("s", base({ lineItems: { nodes: [gqlLine(1), gqlLine(2, { vendor: null }), gqlLine(3)], pageInfo: {} } }));
    expect(order.brands).toEqual(["Duke Beds", "Unmapped"]);
    expect(order.lineStatusIds).toEqual([4]);
  });

  it("puts each line's status, expected date and the order date on the line", () => {
    const { lines } = mapOrder("s", base());
    expect(lines[0]).toMatchObject({ lineStatusId: 4, expectedDate: "2026-12-10", deliveryOutcome: null, orderCreatedAt: new Date("2026-11-18T15:14:12Z") });
  });

  it("leaves statuses null when the record is unreadable", () => {
    const { order, lines } = mapOrder("s", base({ metafield: { value: "{bad" } }));
    expect(order.orderStatusId).toBeNull();
    expect(lines[0].lineStatusId).toBeNull();
  });
});
