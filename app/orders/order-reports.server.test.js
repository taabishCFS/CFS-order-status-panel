import { describe, expect, it } from "vitest";
import { CSV_HEADERS, csvFileName, csvRows, pageTotals, parseOrderReportParams, reportCharts, reportRow, reportWhere, salesWhere } from "./order-reports.server.js";

const sp = (q) => new URLSearchParams(q);
const order = (over = {}) => ({
  orderId: "gid://shopify/Order/1", name: "#1001", customerName: "Ann Lee", createdAt: new Date("2026-11-20T10:30:00Z"), gateway: "shopify_payments",
  subtotalMinor: 100000, discountMinor: 5000, discountCodes: ["SAVE10"], serviceMinor: { two_man: 5000, white_glove: 9900, scotland: 2500, ireland: 1000 },
  totalMinor: 112400, shippingMinor: 0, orderStatusId: 4, cancelledAt: null, outstandingMinor: 0, email: "a@x.example", phone: "0700", postcode: "G1 1AA",
  shippingAddress: JSON.stringify({ address1: "1 High St", city: "Glasgow", province: "Lanarkshire" }), orderTakenBy: "Sam", orderSource: "Phone", site: "CFS", sourceName: "web",
  ...over,
});
const line = (over = {}) => ({ orderId: "gid://shopify/Order/1", lineId: "gid://shopify/LineItem/1", productId: "gid://shopify/Product/77", variantId: "v1", vendor: "Duke", title: "Bed", variantTitle: "King", sku: "B1", quantity: 2, priceMinor: 50000, discountMinor: 5000, lineStatusId: 4, ...over });

describe("parseOrderReportParams", () => {
  it("defaults to today, any status, newest first, page 1", () => {
    expect(parseOrderReportParams(sp(""), "2026-11-27")).toEqual({ from: "2026-11-27", to: "2026-11-27", statuses: [], sort: "date", dir: "desc", page: 1, brand: "" });
  });
  it("swaps reversed dates and keeps only known statuses and sorts", () => {
    const p = parseOrderReportParams(sp("from=2026-11-30&to=2026-11-01&statuses=4,999,x,4,7&sort=drop&dir=asc&page=3&brand=Duke"), "2026-11-27");
    expect(p).toEqual({ from: "2026-11-01", to: "2026-11-30", statuses: [4, 7], sort: "date", dir: "asc", page: 3, brand: "Duke" });
  });
});

describe("filters", () => {
  const p = parseOrderReportParams(sp("from=2026-11-01&to=2026-11-02"), "x");
  it("leaves out Deleted orders when no status is chosen", () => {
    expect(reportWhere("s", p).OR).toEqual([{ orderStatusId: null }, { orderStatusId: { notIn: [9] } }]);
  });
  it("uses only the chosen statuses", () => {
    expect(reportWhere("s", { ...p, statuses: [9] }).orderStatusId).toEqual({ in: [9] });
  });
  it("counts as sales only orders not cancelled and not in a skipped status", () => {
    expect(salesWhere("s", p)).toMatchObject({ cancelledAt: null, OR: [{ orderStatusId: null }, { orderStatusId: { notIn: [7, 9, 32, 50, 58] } }] });
  });
});

describe("rows", () => {
  it("shows the coupon, the service charges and the status name; Scotland adds the remote charges", () => {
    expect(reportRow(order())).toMatchObject({ coupon: "SAVE10", whiteGloveMinor: 9900, twoManMinor: 5000, scotlandMinor: 3500, status: "In Stock", mode: "shopify_payments" });
    expect(reportRow(order({ cancelledAt: new Date() })).status).toBe("Cancelled");
  });
  it("adds up the page", () => {
    const rows = [reportRow(order()), reportRow(order({ totalMinor: 100, serviceMinor: {} }))];
    expect(pageTotals(rows)).toMatchObject({ totalMinor: 112500, twoManMinor: 5000 });
  });
});

describe("charts", () => {
  it("adds sales by brand and payment, leaving out cancelled and skipped orders; line statuses keep cancelled orders", async () => {
    const orders = [
      { orderId: "a", cancelledAt: null, orderStatusId: 4, gateway: "card" },
      { orderId: "b", cancelledAt: new Date(), orderStatusId: 7, gateway: "card" },
      { orderId: "c", cancelledAt: null, orderStatusId: 9, gateway: "cash" },
    ];
    const lines = [
      { orderId: "a", vendor: "Duke", priceMinor: 1000, quantity: 2, discountMinor: 100, lineStatusId: 4 },
      { orderId: "b", vendor: "Duke", priceMinor: 5000, quantity: 1, discountMinor: 0, lineStatusId: 7 },
      { orderId: "c", vendor: "Kaye", priceMinor: 5000, quantity: 1, discountMinor: 0, lineStatusId: 4 },
    ];
    const db = { order: { findMany: async () => orders }, orderLine: { findMany: async () => lines } };
    const c = await reportCharts(db, "s", parseOrderReportParams(sp(""), "2026-11-27"));
    expect(c.brands).toEqual([{ label: "Duke", value: 1900 }]);
    expect(c.payments).toEqual([{ label: "card", value: 1900 }]);
    expect(c.lineStatuses).toEqual([{ label: "Cancelled", value: 1 }, { label: "In Stock", value: 1 }]);
  });
});

describe("csv", () => {
  const extra = (over = {}) => ({ costs: new Map([["v1", { costMinor: 20000, range: "Beds" }]]), invoices: new Map(), payments: new Map(), reschedules: new Map(), minerva: new Map(), ...over });
  it("has the 64 old columns and puts the order's charges on its first line only", () => {
    const o = order();
    const rows = csvRows([o], new Map([[o.orderId, [line(), line({ lineId: "gid://shopify/LineItem/2", quantity: 1, discountMinor: 0 })]]]), extra());
    expect(CSV_HEADERS).toHaveLength(64);
    expect(rows).toHaveLength(2);
    const h = (name) => CSV_HEADERS.indexOf(name);
    expect(rows[0][h("Order No")]).toBe("1001");
    expect(rows[0][h("iProductId")]).toBe("77");
    expect(rows[0][h("Address")]).toBe("1 High St, Glasgow");
    expect(rows[0][h("County")]).toBe("Lanarkshire");
    expect(rows[0][h("Range Name")]).toBe("Beds");
    expect(rows[0][h("Final Sale Price")]).toBe("950.00");
    expect(rows[0][h("2 Man Del")]).toBe("50.00");
    expect(rows[1][h("2 Man Del")]).toBe("");
    // 950 + 50 + 99 + 25 + 10 = 1134
    expect(rows[0][h("Grand Total")]).toBe("1134.00");
    expect(rows[0][h("VAT(16.67%)")]).toBe("189.00");
    expect(rows[0][h("Total Cost")]).toBe("400.00");
    expect(rows[0][h("Gross Profit")]).toBe("545.00");
    expect(rows[0][h("Voucher Name")]).toBe("SAVE10");
    expect(rows[0][h("Order Status")]).toBe("In Stock");
  });
  it("uses the manual cost, supplier invoice, reschedule and Minerva details when there are some", () => {
    const o = order();
    const rows = csvRows([o], new Map([[o.orderId, [line()]]]), extra({
      payments: new Map([["gid://shopify/LineItem/1", { manualCostMinor: 30000, dhdCostMinor: 1500 }]]),
      invoices: new Map([["gid://shopify/LineItem/1", { amountMinor: 30000, invoiceDate: "2026-11-21", invoiceNumber: "INV9", paid: true }]]),
      reschedules: new Map([["gid://shopify/LineItem/1", { count: 2, chargeMinor: 2500 }]]),
      minerva: new Map([["Duke", { discHundredths: 250, fromDate: "2026-11-01", toDate: "2026-11-30" }]]),
    }));
    const h = (name) => CSV_HEADERS.indexOf(name);
    expect(rows[0][h("Total Cost")]).toBe("300.00");
    expect(rows[0][h("Dhd Charges")]).toBe("15.00");
    expect(rows[0][h("Supplier Invoice Date")]).toBe("21/11/2026");
    expect(rows[0][h("Supplier Invoice Paid")]).toBe("Yes");
    expect(rows[0][h("Reschedule Delivery Count")]).toBe(2);
    expect(rows[0][h("Minerva Discount")]).toBe("2.5");
    expect(rows[0][h("Minerva To Date")]).toBe("30/11/2026");
  });
  it("names the file after the brand and dates", () => {
    expect(csvFileName({ brand: "", from: "2026-11-01", to: "2026-11-02" })).toBe("order_report_All brands-2026-11-01 to 2026-11-02.csv");
  });
});
