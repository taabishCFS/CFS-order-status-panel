import { describe, expect, it } from "vitest";
import { deliveryNoteHtml, invoiceHtml, labelHtml, returnLabelHtml, savePdfHtml } from "./document-pages";
import { deliveryNoteAllowed, gbp, shapeDocOrder, siteCodeOf, siteDetails } from "./documents";

const money = (amount) => ({ shopMoney: { amount, currencyCode: "GBP" } });
const line = (over = {}) => ({
  id: "gid://shopify/LineItem/1", title: "Oslo Sideboard", variantTitle: "Oak", sku: "HN-OSL", quantity: 1, currentQuantity: 1,
  image: { url: "https://cdn/x.jpg" }, customAttributes: [{ key: "Colour", value: "Grey" }, { key: "_hidden", value: "x" }],
  originalUnitPriceSet: money("100.0"), discountAllocations: [{ allocatedAmountSet: money("6.0"), discountApplication: { index: 0 } }, { allocatedAmountSet: money("4.0"), discountApplication: { index: 1 } }], ...over,
});
const order = (over = {}) => ({
  name: "#1038", createdAt: "2026-11-22T10:00:00Z", tags: ["site:CFS"], email: "a@b.co", phone: null, note: "Leave with neighbour",
  currentTotalPriceSet: money("110.0"), totalReceivedSet: money("110.0"), totalOutstandingSet: money("0.0"),
  shippingAddress: { name: "Matt P", address1: "35 East Park Way", address2: null, city: "Wolverhampton", province: null, zip: "WV1 2DN", country: "United Kingdom", phone: "0784" },
  billingAddress: null,
  shippingLines: { nodes: [{ title: "Free Door Delivery", originalPriceSet: money("0.0") }] },
  discountApplications: { nodes: [{ __typename: "AutomaticDiscountApplication", value: { percentage: 6 } }, { __typename: "DiscountCodeApplication", code: "BLACK12", value: { __typename: "PricingPercentageValue", percentage: 4 } }] },
  lineItems: { nodes: [line(), line({ id: "gid://shopify/LineItem/2", title: "Two Man Delivery [svc:two_man]", originalUnitPriceSet: money("20.0"), discountAllocations: [], customAttributes: [], variantTitle: null })] },
  ...over,
});
const state = JSON.stringify({ lines: { "gid://shopify/LineItem/1": { statusId: 4 } }, expected: { "gid://shopify/LineItem/1": { date: "2026-11-24" } }, instructions: { text: "Call first" }, condition: { value: "normal" } });

describe("shapeDocOrder", () => {
  const doc = shapeDocOrder(order(), state);
  it("separates service charges from products and works out the totals", () => {
    expect(doc.lines).toHaveLength(1);
    expect(doc.services).toEqual([{ label: "Two Man Delivery", minor: 2000 }]);
    expect(doc).toMatchObject({ subtotalMinor: 10000, offerMinor: 600, couponMinor: 400, couponValue: "4%", discountMinor: 1000, deliveryMethod: "Free Door Delivery", orderStatus: "", totalMinor: 11000, paidMinor: 11000, balanceMinor: 0, coupons: ["BLACK12"], siteCode: "CFS" });
  });
  it("reads options, status, expected date and instructions, hiding underscore properties", () => {
    expect(doc.lines[0]).toMatchObject({ options: ["Colour: Grey"], variantTitle: "Oak", statusId: 4, expectedDate: "2026-11-24", finalMinor: 9000 });
    expect(doc.instructions).toBe("Call first");
    expect(doc.billing).toEqual(doc.shipping);
  });
  it("skips removed lines and survives a bad status record", () => {
    const d = shapeDocOrder(order({ lineItems: { nodes: [line({ currentQuantity: 0 })] } }), "{not json");
    expect(d.lines).toEqual([]);
    expect(d.instructions).toBe("");
  });
});

describe("deliveryNoteAllowed", () => {
  const base = shapeDocOrder(order(), state);
  it("allows a paid order with a line in a printable status", () => expect(deliveryNoteAllowed(base)).toEqual({ ok: true }));
  it("refuses while a balance is owed or on a 50% or 75% refund condition", () => {
    expect(deliveryNoteAllowed({ ...base, balanceMinor: 100 }).ok).toBe(false);
    expect(deliveryNoteAllowed({ ...base, condition: "75percRefund" }).ok).toBe(false);
    expect(deliveryNoteAllowed({ ...base, condition: "50percRefund" }).ok).toBe(false);
  });
  it("refuses when no line is in a printable status", () => {
    const d = shapeDocOrder(order(), JSON.stringify({ lines: { "gid://shopify/LineItem/1": { statusId: 3 } } }));
    expect(deliveryNoteAllowed(d)).toMatchObject({ ok: false, reason: expect.stringMatching(/status/) });
    expect(deliveryNoteAllowed(shapeDocOrder(order(), null)).ok).toBe(false);
  });
});

describe("site", () => {
  it("reads the site tag and falls back to CFS", () => {
    expect(siteCodeOf(["x", "site:tfs"])).toBe("TFS");
    expect(siteCodeOf([])).toBeNull();
    expect(siteDetails(null).name).toBe("Choice Furniture Superstore");
    expect(siteDetails({ name: "The Furnshop", url: "u", serviceEmail: "e", phone: "p", logoUrl: "l" })).toMatchObject({ name: "The Furnshop", email: "e" });
  });
});

describe("documents", () => {
  const doc = shapeDocOrder(order(), state);
  const site = siteDetails(null);
  it("formats money", () => expect([gbp(1999), gbp(-500)]).toEqual(["£19.99", "−£5.00"]));
  it("the Exc VAT invoice has no VAT rows, the Inc VAT one has them from the grand total", () => {
    const exc = invoiceHtml(doc, site, { vat: false });
    expect(exc).toContain("Invoice #1038");
    expect(exc).toContain("Offer Discount −");
    expect(exc).toContain("Coupon (4%) −");
    expect(exc).toContain("TERMINOLOGY");
    expect(exc).toContain("/documents/cfs-logo.png");
    expect(exc).not.toContain("VAT (20%)");
    expect(exc).toContain("Two Man Delivery");
    const inc = invoiceHtml(doc, site, { vat: true });
    expect(inc).toContain("VAT TAX INVOICE");
    expect(inc).toContain("11530227");
    expect(inc).toContain("VAT (20%)");
    expect(inc).toContain("£18.33"); // 11000 / 6
    expect(inc).toContain("Subtotal (ex. VAT)");
    expect(inc).toContain("GB433397583");
  });
  it("Save PDF shows the picture, delivery date and shipping details", () => {
    const html = savePdfHtml(doc, site);
    expect(html).toContain("https://cdn/x.jpg");
    expect(html).toContain("Delivery: 24/11/2026");
    expect(html).toContain("Print / Save as PDF");
  });
  it("the delivery note lists only printable lines and the instructions", () => {
    const html = deliveryNoteHtml(doc, site);
    expect(html).toContain("Details of Invoice# 1038");
    expect(html).toContain("11/22/2026");
    expect(html).toContain("Free Door Delivery");
    expect(html).toContain("In Stock");
    expect(html).toContain("Call first");
    expect(html).toContain("Leave with neighbour");
  });
  it("the labels carry the address; the return label lists the ticked lines with quantity and type", () => {
    expect(labelHtml(doc)).toContain("35 East Park Way");
    const ret = returnLabelHtml(doc, ["gid://shopify/LineItem/1"], "Free_Stock");
    expect(ret).toContain("Free Stock");
    expect(ret).toContain("Oslo Sideboard");
    expect(returnLabelHtml(doc, ["gid://shopify/LineItem/9"], "Free_Stock")).not.toContain("Oslo Sideboard");
  });
  it("escapes what comes from customers", () => {
    const d = shapeDocOrder(order({ note: "<script>x</script>" }), state);
    expect(deliveryNoteHtml(d, site)).not.toContain("<script>x");
  });
});
