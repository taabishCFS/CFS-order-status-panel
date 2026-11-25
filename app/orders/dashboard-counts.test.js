import { describe, expect, it, vi } from "vitest";
import { dashboardCounts } from "./dashboard-counts.server.js";

describe("dashboardCounts", () => {
  it("counts each tile for the shop only", async () => {
    const orderLine = { count: vi.fn(async () => 5) };
    const refundRequest = { count: vi.fn(async () => 2) };
    const freeStock = { count: vi.fn(async () => 7) };
    const r = await dashboardCounts({ orderLine, refundRequest, freeStock }, "s.myshopify.com", new Date("2026-11-30T10:00:00Z"));
    expect(r).toEqual({ inProgress: 5, lapsed: 5, chaseup: 5, refunds: 2, sbts: 7, freeStock: 7 });
    expect(orderLine.count.mock.calls[0][0].where).toEqual({ shop: "s.myshopify.com", orderArchived: false, lineStatusId: 3 });
    for (const [arg] of orderLine.count.mock.calls) expect(arg.where.shop).toBe("s.myshopify.com");
    expect(refundRequest.count.mock.calls[0][0].where).toEqual({ shop: "s.myshopify.com", status: "requested", removedAt: null });
    expect(freeStock.count.mock.calls[0][0].where.itemType).toEqual({ not: "freeStock" });
    expect(freeStock.count.mock.calls[1][0].where.itemType).toBe("freeStock");
  });
});
