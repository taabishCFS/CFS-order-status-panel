import { describe, expect, it } from "vitest";
import { buildReport } from "./report-query.server.js";
import { DELIVERY_STATUS_IDS, MAX_REPORT_ORDERS, parseReportRange } from "./report-rules.js";

const order = (i, over = {}) => ({ orderId: `O${i}`, name: `#${i}`, createdAt: new Date("2026-11-20T10:00:00Z"), cancelledAt: null, customerName: "A", email: "a@x.com", currency: "GBP", totalMinor: 1200, outstandingMinor: 0, phone: null, billingAddress: null, shippingAddress: null, ...over });
function fakeDb(orders, lines) {
  const calls = { order: null, line: null };
  return {
    calls,
    order: { findMany: async (args) => { calls.order = args; return orders; } },
    orderLine: { findMany: async (args) => { calls.line = args; return lines; } },
  };
}

describe("buildReport xero", () => {
  const range = parseReportRange("2026-11-01", "2026-11-30");
  it("asks only for the shop's non-cancelled orders in the range, oldest first", async () => {
    const db = fakeDb([order(1)], []);
    const r = await buildReport({ db, shop: "s", kind: "xero", range });
    expect(db.calls.order.where).toEqual({ shop: "s", cancelledAt: null, createdAt: { gte: range.gte, lte: range.lte } });
    expect(db.calls.order.orderBy).toEqual({ createdAt: "asc" });
    expect(r.count).toBe(1);
    expect(r.csv.split("\r\n")).toHaveLength(3);
  });
  it("reads the lines of just those orders and skips the line query when there are none", async () => {
    const db = fakeDb([order(1), order(2)], [{ orderId: "O1", lineId: "L1", sku: "S", title: "Bed", vendor: "V", lineStatusId: 4 }]);
    const r = await buildReport({ db, shop: "s", kind: "xero", range });
    expect(db.calls.line.where).toEqual({ shop: "s", orderId: { in: ["O1", "O2"] } });
    expect(r.csv).toContain("Bed");
    const empty = fakeDb([], []);
    await buildReport({ db: empty, shop: "s", kind: "xero", range });
    expect(empty.calls.line).toBeNull();
  });
  it("says when the cap was reached and trims to it", async () => {
    const many = Array.from({ length: MAX_REPORT_ORDERS + 1 }, (_, i) => order(i));
    const r = await buildReport({ db: fakeDb(many, []), shop: "s", kind: "xero", range });
    expect(r.capped).toBe(true);
    expect(r.count).toBe(MAX_REPORT_ORDERS);
  });
});

describe("buildReport delivery", () => {
  it("narrows to nothing-owed, unarchived orders with a ready line, then checks every line", async () => {
    const db = fakeDb([order(1), order(2)], [
      { orderId: "O1", lineId: "L1", sku: null, title: "Bed", vendor: null, lineStatusId: 4 },
      { orderId: "O2", lineId: "L2", sku: null, title: "Sofa", vendor: null, lineStatusId: 4 },
      { orderId: "O2", lineId: "L3", sku: null, title: "Chair", vendor: null, lineStatusId: 1 },
    ]);
    const r = await buildReport({ db, shop: "s", kind: "delivery" });
    expect(db.calls.order.where).toEqual({ shop: "s", cancelledAt: null, archivedAt: null, outstandingMinor: { lte: 0 }, lineStatusIds: { hasSome: DELIVERY_STATUS_IDS } });
    expect(r.count).toBe(1);
  });
});
