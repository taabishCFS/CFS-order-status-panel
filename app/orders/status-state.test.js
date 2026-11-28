import { describe, expect, it } from "vitest";
import { readStatusState } from "./status-state.js";

const saved = JSON.stringify({
  schemaVersion: 2,
  order: { statusId: 3, label: "Order in Progress" },
  lines: { L1: { statusId: 4, label: "In Stock" }, L2: { statusId: 10, label: "x" } },
  history: [],
  expected: { L2: { date: "2026-12-10", at: "t", by: {} } },
  delivery: { L1: { outcome: "confirmed", at: "t", by: {} } },
});

describe("readStatusState", () => {
  it("reads the order status, line statuses, expected dates and delivery outcomes", () => {
    expect(readStatusState(saved)).toEqual({
      orderStatusId: 3,
      lines: {
        L1: { statusId: 4, expectedDate: null, delivery: "confirmed", stockedDate: null, cancelReason: null },
        L2: { statusId: 10, expectedDate: "2026-12-10", delivery: null, stockedDate: null, cancelReason: null },
      },
      unreadable: false,
    });
  });

  it("keeps the expected date and delivery answer of a line that never had a status", () => {
    const r = readStatusState(JSON.stringify({ lines: {}, expected: { L1: { date: "2026-12-05" } }, delivery: { L2: { outcome: "confirmed" } } }));
    expect(r.lines.L1).toEqual({ statusId: null, expectedDate: "2026-12-05", delivery: null, stockedDate: null, cancelReason: null });
    expect(r.lines.L2).toEqual({ statusId: null, expectedDate: null, delivery: "confirmed", stockedDate: null, cancelReason: null });
  });
  it("treats a missing record as empty, not unreadable", () => {
    expect(readStatusState(null)).toEqual({ orderStatusId: null, lines: {}, unreadable: false });
  });

  it("flags invalid JSON and a record without lines as unreadable", () => {
    expect(readStatusState("{nope")).toEqual({ orderStatusId: null, lines: {}, unreadable: true });
    expect(readStatusState(JSON.stringify({ history: [] }))).toEqual({ orderStatusId: null, lines: {}, unreadable: true });
  });

  it("reads wrong types as null instead of throwing", () => {
    const odd = JSON.stringify({ order: { statusId: "x" }, lines: { L1: { statusId: "3" } }, expected: { L1: { date: 5 } }, delivery: { L1: { outcome: "maybe" } } });
    expect(readStatusState(odd).lines.L1).toEqual({ statusId: null, expectedDate: null, delivery: null, stockedDate: null, cancelReason: null });
  });
  it("reads the date each line came into stock, even for a line that has moved on", () => {
    const r = readStatusState(JSON.stringify({
      lines: { L1: { statusId: 12 } },
      supplierDelivered: { L1: { date: "2026-11-10", at: "2026-11-10T09:00:00Z", by: {} }, L2: { date: "2026-11-11", at: "x", by: {} } },
    }));
    expect(r.lines.L1.stockedDate).toBe("2026-11-10");
    expect(r.lines.L2).toEqual({ statusId: null, expectedDate: null, delivery: null, stockedDate: "2026-11-11", cancelReason: null });
  });

  it("ignores a stock date that is not a plain date", () => {
    const r = readStatusState(JSON.stringify({ lines: { L1: { statusId: 4 } }, supplierDelivered: { L1: { date: "yesterday" } } }));
    expect(r.lines.L1.stockedDate).toBeNull();
  });
});
