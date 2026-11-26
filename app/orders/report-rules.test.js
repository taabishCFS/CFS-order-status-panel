import { describe, expect, it } from "vitest";
import { DELIVERY_HEADERS, XERO_HEADERS, deliveryCsv, parseReportRange, readyForDelivery, reportFilename, xeroCsv, xeroIncluded, xeroRow } from "./report-rules.js";

const order = (over = {}) => ({
  orderId: "gid://shopify/Order/1", name: "#1038", createdAt: new Date("2026-11-20T12:40:00Z"), cancelledAt: null, customerName: "Spike Test",
  email: "spike@example.com", currency: "GBP", totalMinor: 12000, outstandingMinor: 0, phone: null,
  billingAddress: JSON.stringify({ name: "Bill Payer", address1: "2 High St", address2: "Flat 3", city: "Leicester", province: "England", zip: "LE1 1AA", country: "United Kingdom" }),
  shippingAddress: JSON.stringify({ name: "Spike Test", address1: "1 Test Street", city: "Leicester", province: "England", zip: "LE1 1AA", country: "United Kingdom", phone: "0116" }),
  ...over,
});
const line = (over = {}) => ({ lineId: "L1", sku: "SKU1", title: "Bed", vendor: "Duke Beds", lineStatusId: 4, ...over });

describe("parseReportRange", () => {
  it("accepts a valid range and covers both days in UTC", () => {
    const r = parseReportRange("2026-11-01", "2026-11-30");
    expect(r.gte.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r.lte.toISOString()).toBe("2026-11-30T23:59:59.999Z");
  });
  it("accepts a single day", () => expect(parseReportRange("2026-11-01", "2026-11-01")).not.toBeNull());
  it("refuses missing, invalid, reversed and over-long ranges", () => {
    expect(parseReportRange(undefined, "2026-11-01")).toBeNull();
    expect(parseReportRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(parseReportRange("2026-11-05", "2026-11-01")).toBeNull();
    expect(parseReportRange("2025-01-01", "2026-11-01")).toBeNull();
  });
});

describe("reportFilename", () => {
  it("names the Xero file like the legacy one", () => expect(reportFilename("xero", { from: "2026-11-01", to: "2026-11-30" })).toBe("Xero_Report-2026-11-01_to_2026-11-30.csv"));
  it("names the delivery file", () => expect(reportFilename("delivery")).toBe("delivery_report.csv"));
});

describe("xeroRow", () => {
  it("has one value per header", () => expect(xeroRow(order(), [line()])).toHaveLength(XERO_HEADERS.length));
  it("takes VAT as one sixth of the total and the rest as net", () => {
    const row = xeroRow(order(), [line()]);
    expect(row[XERO_HEADERS.indexOf("Total")]).toBe("120.00");
    expect(row[XERO_HEADERS.indexOf("UnitAmount")]).toBe("100.00");
    expect(row[XERO_HEADERS.indexOf("TaxAmount")]).toBe("20.00");
    expect(row[XERO_HEADERS.indexOf("AccountCode")]).toBe("200");
    expect(row[XERO_HEADERS.indexOf("TaxType")]).toBe("20% (VAT on Income)");
  });
  it("uses the billing address, the order number without #, and UK dates", () => {
    const row = xeroRow(order(), [line()]);
    expect(row.slice(0, 10)).toEqual(["Bill Payer", "spike@example.com", "2 High St", "Flat 3", "", "", "Leicester", "England", "LE1 1AA", "United Kingdom"]);
    expect(row[XERO_HEADERS.indexOf("InvoiceNumber")]).toBe("1038");
    expect(row[XERO_HEADERS.indexOf("InvoiceDate")]).toBe("20/11/2026");
  });
  it("falls back to the shipping address and the customer name", () => {
    const row = xeroRow(order({ billingAddress: null }), [line()]);
    expect(row[0]).toBe("Spike Test");
    expect(row[2]).toBe("1 Test Street");
  });
  it("joins product names and codes", () => {
    const row = xeroRow(order(), [line(), line({ lineId: "L2", sku: null, title: "Chair" })]);
    expect(row[XERO_HEADERS.indexOf("InventoryItemCode")]).toBe("SKU1");
    expect(row[XERO_HEADERS.indexOf("Description")]).toBe("Bed, Chair");
  });
  it("tags an Urban Deco order and nothing else", () => {
    expect(xeroRow(order(), [line({ vendor: "Urban Deco" })]).slice(23, 25)).toEqual(["Brand", "Urban Deco"]);
    expect(xeroRow(order(), [line()]).slice(23, 25)).toEqual(["", ""]);
  });
  it("copes with unreadable addresses", () => {
    expect(xeroRow(order({ billingAddress: "{bad", shippingAddress: null }), [line()])[0]).toBe("Spike Test");
  });
});

describe("xeroIncluded", () => {
  it("leaves out cancelled, Deleted, Failed, Awaiting Payment, Awaiting V12 and cash-at-store orders", () => {
    expect(xeroIncluded(order({ orderStatusId: 4, gateway: "kody" }))).toBe(true);
    expect(xeroIncluded(order({ orderStatusId: null, gateway: null }))).toBe(true);
    for (const id of [9, 32, 50, 58]) expect(xeroIncluded(order({ orderStatusId: id }))).toBe(false);
    expect(xeroIncluded(order({ cancelledAt: new Date() }))).toBe(false);
    expect(xeroIncluded(order({ gateway: "cash" }))).toBe(false);
    expect(xeroIncluded(order({ gateway: "Pay By Cash Store" }))).toBe(false);
  });
});

describe("xeroCsv", () => {
  it("writes the header and one row per order", () => {
    const text = xeroCsv([order(), order({ orderId: "2", name: "#1039" })], new Map([["gid://shopify/Order/1", [line()]]]));
    expect(text.split("\r\n")).toHaveLength(4);
    expect(text.startsWith("ContactName,EmailAddress")).toBe(true);
  });
});

describe("readyForDelivery", () => {
  it("needs every line ready, nothing owed and the order not cancelled", () => {
    expect(readyForDelivery(order(), [line(), line({ lineStatusId: 61 })])).toBe(true);
    expect(readyForDelivery(order(), [line(), line({ lineStatusId: 1 })])).toBe(false);
    expect(readyForDelivery(order({ outstandingMinor: 100 }), [line()])).toBe(false);
    expect(readyForDelivery(order({ cancelledAt: new Date() }), [line()])).toBe(false);
    expect(readyForDelivery(order(), [])).toBe(false);
    expect(readyForDelivery(order(), [line({ lineStatusId: null })])).toBe(false);
  });
});

describe("deliveryCsv", () => {
  it("lists only ready orders, numbered, with the legacy depot and drop window", () => {
    const orders = [order(), order({ orderId: "2", name: "#1039" })];
    const lines = new Map([["gid://shopify/Order/1", [line()]], ["2", [line({ lineStatusId: 1 })]]]);
    const { csv, count } = deliveryCsv(orders, lines);
    expect(count).toBe(1);
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toBe(DELIVERY_HEADERS.join(","));
    expect(rows[1]).toBe('1,1038,20/11/2026,1 Test Street,"Leicester, England, United Kingdom, LE1 1AA",,,Choice Furniture,7:30,16:00,15,Spike Test,0116,20/11/2026,--');
  });
  it("gives a header only when nothing is ready", () => expect(deliveryCsv([], new Map()).count).toBe(0));
});
