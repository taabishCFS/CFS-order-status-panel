import { describe, expect, it, vi } from "vitest";
import { buildReport } from "./report-query.server.js";
import { DHD_WITH_SUPPLIER, STOCK_HEADERS, STOCK_REPORTS, parseReportParams, parseReportRange, reportFilename, stockRow } from "./report-rules.js";

const range = parseReportRange("2026-11-01", "2026-11-30");
const line = (i, over = {}) => ({ orderId: `O${i}`, lineId: `L${i}`, variantId: `V${i}`, vendor: "Actona", title: `Bed ${i}`, quantity: 2, lineStatusId: 12, stockedDate: "2026-11-10", orderCreatedAt: new Date("2026-11-20T10:00:00Z"), ...over });

function fakeDb({ lines = [], paid = [], orders = null } = {}) {
  const calls = {};
  return {
    calls,
    orderLine: { findMany: vi.fn(async (a) => { calls.lines = a; return lines; }) },
    lineSupplierInvoice: { findMany: vi.fn(async () => paid) },
    order: { findMany: vi.fn(async () => orders ?? lines.map((l) => ({ orderId: l.orderId, name: `#${l.orderId.slice(1)}`, cancelledAt: null }))) },
  };
}
const costGraphql = (costs) => async () => ({ json: async () => ({ data: { nodes: Object.entries(costs).map(([id, amount]) => ({ id, inventoryItem: { unitCost: amount == null ? null : { amount } }, product: { collections: { nodes: [] } } })) } }) });

describe("stock report rules", () => {
  it("both reports are known, need dates and no terms", () => {
    for (const kind of ["instock", "unpaid"]) {
      expect(parseReportParams(kind, (n) => ({ from: "2026-11-01", to: "2026-11-30" })[n]).range.from).toBe("2026-11-01");
      expect(parseReportParams(kind, () => undefined)).toBeNull();
    }
  });
  it("uses the legacy file names and status lists", () => {
    expect(reportFilename("instock", range)).toBe("Total-Outstanding-After-Instock-Report-2026-11-01_to_2026-11-30.csv");
    expect(reportFilename("unpaid", range)).toBe("Total-Outstanding-Report-2026-11-01_to_2026-11-30.csv");
    expect(STOCK_REPORTS.instock.statusFilter).toEqual({ notIn: [1, 9, 32, 34, 35, 50] });
    expect(STOCK_REPORTS.unpaid.statusFilter).toEqual({ in: [3, 35, 10, 12, 1, 14, 4, 6] });
    expect(DHD_WITH_SUPPLIER).toBe(36);
  });
  it("writes the seven legacy columns with cost per item times quantity", () => {
    const row = stockRow(line(1), { orderName: "#1038", orderCreatedAt: new Date("2026-11-20T10:00:00Z"), statusLabel: "Invoice Received", costMinor: 12550 });
    expect(row).toEqual(["1038", "20/11/2026", "Actona", "Bed 1", 2, "251.00", "Invoice Received"]);
    expect(row).toHaveLength(STOCK_HEADERS.length);
    expect(stockRow(line(1, { vendor: " " }), { orderName: "#1", orderCreatedAt: new Date("2026-11-20T10:00:00Z"), statusLabel: null, costMinor: null }).slice(2, 7)).toEqual(["Unmapped", "Bed 1", 2, "", ""]);
  });
});

describe("buildReport instock and unpaid", () => {
  it("asks for lines that have been in stock, not Clearance, in the range, with the report's statuses", async () => {
    for (const kind of ["instock", "unpaid"]) {
      const db = fakeDb({ lines: [line(1)] });
      await buildReport({ db, graphql: costGraphql({ V1: "10.00" }), shop: "s", kind, range });
      expect(db.calls.lines.where).toEqual({
        shop: "s", quantity: { gt: 0 }, lineStatusId: STOCK_REPORTS[kind].statusFilter, orderCreatedAt: { gte: range.gte, lte: range.lte },
        NOT: { title: { contains: "clearance", mode: "insensitive" } },
        OR: [{ stockedDate: { not: null } }, { lineStatusId: 36 }],
      });
    }
  });
  it("does not filter by brand", async () => {
    const db = fakeDb({ lines: [line(1)] });
    await buildReport({ db, graphql: costGraphql({}), shop: "s", kind: "unpaid", range });
    expect(db.calls.lines.where.vendor).toBeUndefined();
  });
  it("leaves out paid lines and lines of cancelled orders, and fills cost times quantity", async () => {
    const lines = [line(1), line(2), line(3)];
    const db = fakeDb({ lines, paid: [{ lineId: "L2" }], orders: [{ orderId: "O1", name: "#1", cancelledAt: null }, { orderId: "O2", name: "#2", cancelledAt: null }, { orderId: "O3", name: "#3", cancelledAt: new Date() }] });
    const r = await buildReport({ db, graphql: costGraphql({ V1: "12.50" }), shop: "s", kind: "instock", range });
    expect(r.count).toBe(1);
    const rows = r.csv.trim().split("\r\n");
    expect(rows[0]).toBe(STOCK_HEADERS.join(","));
    expect(rows[1]).toBe("1,20/11/2026,Actona,Bed 1,2,25.00,Invoice Received");
  });
  it("gives the heading only when nothing matches, without asking Shopify for costs", async () => {
    const graphql = vi.fn();
    const r = await buildReport({ db: fakeDb({ lines: [] }), graphql, shop: "s", kind: "unpaid", range });
    expect(r).toMatchObject({ count: 0, costLookup: "not_needed" });
    expect(r.csv.trim()).toBe(STOCK_HEADERS.join(","));
    expect(graphql).not.toHaveBeenCalled();
  });
  it("still builds the sheet, with blank costs, when Shopify cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await buildReport({ db: fakeDb({ lines: [line(1)] }), graphql: async () => { throw new Error("down"); }, shop: "s", kind: "instock", range });
    expect(r).toMatchObject({ count: 1, costLookup: "unavailable" });
    expect(r.csv.trim().split("\r\n")[1]).toBe("1,20/11/2026,Actona,Bed 1,2,,Invoice Received");
    quiet.mockRestore();
  });
});
