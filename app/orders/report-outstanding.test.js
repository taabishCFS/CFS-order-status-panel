import { describe, expect, it, vi } from "vitest";
import { buildReport } from "./report-query.server.js";
import { OUTSTANDING_HEADERS, OUTSTANDING_STATUS_IDS, outstandingRow, parseReportParams, parseReportRange, reportFilename, reportQuery } from "./report-rules.js";

const range = parseReportRange("2026-11-01", "2026-11-30");
const line = (i, over = {}) => ({ orderId: `O${i}`, lineId: `L${i}`, variantId: `V${i}`, vendor: "Actona", title: `Bed ${i}`, quantity: 2, lineStatusId: 3, expectedDate: "2026-12-05", orderCreatedAt: new Date("2026-11-20T10:00:00Z"), ...over });

function fakeDb({ brands = [{ brand: "Actona" }], lines = [], paid = [], orders = null } = {}) {
  const calls = {};
  return {
    calls,
    brandTerms: { findMany: vi.fn(async (a) => { calls.brands = a; return brands; }) },
    orderLine: { findMany: vi.fn(async (a) => { calls.lines = a; return lines; }) },
    lineSupplierInvoice: { findMany: vi.fn(async (a) => { calls.paid = a; return paid; }) },
    order: { findMany: vi.fn(async () => orders ?? lines.map((l) => ({ orderId: l.orderId, name: `#${l.orderId.slice(1)}`, cancelledAt: null }))) },
  };
}
const costGraphql = (costs) => async () => ({ json: async () => ({ data: { nodes: Object.entries(costs).map(([id, amount]) => ({ id, inventoryItem: { unitCost: amount == null ? null : { amount } }, product: { collections: { nodes: [] } } })) } }) });

describe("report parameters", () => {
  it("outstanding needs dates and a known terms value", () => {
    const get = (m) => (n) => m[n];
    expect(parseReportParams("outstanding", get({ from: "2026-11-01", to: "2026-11-30", terms: "credit" })).terms).toBe("credit");
    expect(parseReportParams("outstanding", get({ from: "2026-11-01", to: "2026-11-30", terms: "cash" }))).toBeNull();
    expect(parseReportParams("outstanding", get({ from: "2026-11-01", to: "2026-11-30" }))).toBeNull();
    expect(parseReportParams("outstanding", get({ terms: "credit" }))).toBeNull();
    expect(parseReportParams("delivery", get({}))).toEqual({ range: undefined, terms: undefined });
    expect(parseReportParams("nope", get({}))).toBeNull();
  });
  it("builds the link query and the file name", () => {
    expect(reportQuery({ range, terms: "proforma" })).toBe("from=2026-11-01&to=2026-11-30&terms=proforma");
    expect(reportQuery({})).toBe("");
    expect(reportFilename("outstanding", range, "credit")).toBe("Credit_Total-Outstanding-Report-2026-11-01_to_2026-11-30.csv");
    expect(reportFilename("outstanding", range, "proforma")).toBe("Pro-forma_Total-Outstanding-Report-2026-11-01_to_2026-11-30.csv");
  });
  it("uses the legacy status lists", () => {
    expect(OUTSTANDING_STATUS_IDS.credit).toEqual([14, 6, 10, 4, 35, 12, 3, 1, 57, 36]);
    expect(OUTSTANDING_STATUS_IDS.proforma).toEqual([10, 35, 12, 3, 1, 57, 36]);
  });
});

describe("outstandingRow", () => {
  it("multiplies the cost per item by the quantity and formats dates the UK way", () => {
    const row = outstandingRow(line(1), { orderName: "#1038", orderCreatedAt: new Date("2026-11-20T10:00:00Z"), statusLabel: "Order in Progress", costMinor: 12550 });
    expect(row).toEqual(["1038", "20/11/2026", "Actona", "Bed 1", 2, "251.00", "Order in Progress", "05/12/2026", ""]);
    expect(row).toHaveLength(OUTSTANDING_HEADERS.length);
  });
  it("leaves the cost blank when Shopify has none and shows --- for no expected date", () => {
    const row = outstandingRow(line(1, { expectedDate: null, vendor: null }), { orderName: "#1", orderCreatedAt: new Date("2026-11-20T10:00:00Z"), statusLabel: null, costMinor: null });
    expect(row.slice(2, 9)).toEqual(["Unmapped", "Bed 1", 2, "", "", "---", ""]);
  });
});

describe("buildReport outstanding", () => {
  it("asks only for brands on those terms, owed statuses, kept quantities and the date range", async () => {
    const db = fakeDb({ lines: [line(1)] });
    await buildReport({ db, graphql: costGraphql({ V1: "10.00" }), shop: "s", kind: "outstanding", range, terms: "proforma" });
    expect(db.calls.brands).toEqual({ where: { shop: "s", terms: "proforma" } });
    expect(db.calls.lines.where).toEqual({ shop: "s", vendor: { in: ["Actona"] }, lineStatusId: { in: OUTSTANDING_STATUS_IDS.proforma }, quantity: { gt: 0 }, orderCreatedAt: { gte: range.gte, lte: range.lte } });
  });
  it("returns the header only, without reading lines, when no brand is on those terms", async () => {
    const db = fakeDb({ brands: [] });
    const r = await buildReport({ db, shop: "s", kind: "outstanding", range, terms: "credit" });
    expect(r).toMatchObject({ count: 0, brands: 0 });
    expect(r.csv.trim()).toBe(OUTSTANDING_HEADERS.join(","));
    expect(db.orderLine.findMany).not.toHaveBeenCalled();
  });
  it("leaves out lines whose supplier invoice is paid and lines of cancelled orders", async () => {
    const lines = [line(1), line(2), line(3)];
    const db = fakeDb({ lines, paid: [{ lineId: "L2" }], orders: [{ orderId: "O1", name: "#1", cancelledAt: null }, { orderId: "O2", name: "#2", cancelledAt: null }, { orderId: "O3", name: "#3", cancelledAt: new Date() }] });
    const r = await buildReport({ db, graphql: costGraphql({ V1: "5.00" }), shop: "s", kind: "outstanding", range, terms: "credit" });
    expect(r.count).toBe(1);
    expect(r.csv).toContain("Bed 1");
    expect(r.csv).not.toContain("Bed 2");
    expect(r.csv).not.toContain("Bed 3");
    expect(db.calls.paid.where).toEqual({ shop: "s", lineId: { in: ["L1", "L2", "L3"] }, paid: true });
  });
  it("fills the total cost from Shopify and leaves it blank when a product has no cost", async () => {
    const db = fakeDb({ lines: [line(1), line(2)] });
    const r = await buildReport({ db, graphql: costGraphql({ V1: "12.50", V2: null }), shop: "s", kind: "outstanding", range, terms: "credit" });
    const rows = r.csv.trim().split("\r\n");
    expect(rows[1]).toContain(",25.00,");
    expect(rows[2]).toContain(",2,,Order in Progress,");
    expect(r.costLookup).toBe("ok");
  });
  it("still builds the sheet, with blank costs, when Shopify cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ lines: [line(1)] });
    const r = await buildReport({ db, graphql: async () => { throw new Error("down"); }, shop: "s", kind: "outstanding", range, terms: "credit" });
    expect(r).toMatchObject({ count: 1, costLookup: "unavailable" });
    expect(r.csv.trim().split("\r\n")[1]).toContain(",2,,Order in Progress,");
    quiet.mockRestore();
  });
});
