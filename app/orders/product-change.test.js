import { describe, expect, it } from "vitest";
import { lineText, readProductInput } from "./product-change";

const V = "gid://shopify/ProductVariant/9";
const L = "gid://shopify/LineItem/3";

describe("readProductInput", () => {
  it("accepts a variant and a quantity, with or without a line to replace", () => {
    expect(readProductInput({ variantId: V, quantity: 2 })).toEqual({ value: { variantId: V, quantity: 2, replaceLineItemId: null } });
    expect(readProductInput({ variantId: V, quantity: "1", replaceLineItemId: L })).toEqual({ value: { variantId: V, quantity: 1, replaceLineItemId: L } });
    expect(readProductInput({ variantId: V, quantity: 1, replaceLineItemId: "" }).value.replaceLineItemId).toBeNull();
  });
  it("refuses a bad product, quantity or line", () => {
    expect(readProductInput(null)).toEqual({ error: "bad_request" });
    expect(readProductInput({ variantId: "9", quantity: 1 })).toEqual({ error: "bad_product" });
    expect(readProductInput({ variantId: V, quantity: 0 })).toEqual({ error: "bad_quantity" });
    expect(readProductInput({ variantId: V, quantity: 25 })).toEqual({ error: "bad_quantity" });
    expect(readProductInput({ variantId: V, quantity: 1.5 })).toEqual({ error: "bad_quantity" });
    expect(readProductInput({ variantId: V, quantity: 1, replaceLineItemId: "x" })).toEqual({ error: "bad_line" });
  });
});

describe("lineText", () => {
  it("writes title, option, quantity and total, leaving out Default Title", () => {
    expect(lineText({ title: "Oslo Sideboard", variantTitle: "Oak", quantity: 2, totalMinor: 23998 })).toBe("Oslo Sideboard (Oak) x 2 = £239.98");
    expect(lineText({ title: "Bergen Table", variantTitle: "Default Title", quantity: 1, totalMinor: 5000 })).toBe("Bergen Table x 1 = £50.00");
  });
});
