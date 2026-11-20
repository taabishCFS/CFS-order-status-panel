import { describe, expect, it } from "vitest";
import { gqlLine, gqlOrder } from "./fixtures.js";
import { mapOrder, siteOf } from "./map-order.js";

const money = (amount) => ({ shopMoney: { amount, currencyCode: "GBP" } });

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

  it("keeps the vendor (the legacy brand) and variant title on each line", () => {
    const { lines } = mapOrder("s", gqlOrder());
    expect(lines[0]).toMatchObject({ vendor: "Duke Beds", variantTitle: "2ft 6in" });
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
