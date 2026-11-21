import { describe, expect, it, vi } from "vitest";
import { addRefundRequest, listRefundRequests } from "./refund-request.server.js";

const SHOP = "s.myshopify.com";
const ORDER = "gid://shopify/Order/1";
const L = (n) => `gid://shopify/LineItem/${n}`;
const actor = { id: "9", name: "Sam Patel" };
const input = (over = {}) => ({ clientKey: "k1", reason: "DamagedPartRefund", type: "part", amountMinor: 2500, lineIds: [L(1)], notes: "Leg snapped", ...over });

function fakeDb({ order = { name: "#1001", totalMinor: 10000, refundedMinor: 1000 }, lineCount = 1, existing = null, requestedSum = 0, rows = [] } = {}) {
  return {
    order: { findFirst: vi.fn(async () => order) },
    orderLine: { count: vi.fn(async () => lineCount) },
    refundRequest: {
      findFirst: vi.fn(async () => existing),
      aggregate: vi.fn(async () => ({ _sum: { amountMinor: requestedSum } })),
      create: vi.fn(async ({ data }) => ({ id: "r1", status: "requested", createdAt: new Date("2026-11-21T10:00:00Z"), ...data })),
      findMany: vi.fn(async () => rows),
    },
  };
}

describe("addRefundRequest", () => {
  it("records the request as requested, with who asked and the order name", async () => {
    const db = fakeDb();
    const res = await addRefundRequest(db, { shop: SHOP, orderId: ORDER, input: input(), actor });
    expect(res).toMatchObject({ ok: true, request: { id: "r1", type: "part", amountMinor: 2500, status: "requested", createdByName: "Sam Patel" } });
    expect(db.refundRequest.create.mock.calls[0][0].data).toMatchObject({ shop: SHOP, orderId: ORDER, orderName: "#1001", clientKey: "k1", reason: "DamagedPartRefund", lineIds: [L(1)], notes: "Leg snapped", createdById: "9", createdByName: "Sam Patel" });
  });

  it("fills a full refund with everything still refundable (total less refunded less already requested)", async () => {
    const db = fakeDb({ requestedSum: 2000 });
    const res = await addRefundRequest(db, { shop: SHOP, orderId: ORDER, input: input({ type: "full", amountMinor: null }), actor });
    expect(res.request.amountMinor).toBe(7000);
  });

  it("refuses more than is refundable and says how much is", async () => {
    const db = fakeDb({ requestedSum: 8000 });
    expect(await addRefundRequest(db, { shop: SHOP, orderId: ORDER, input: input({ amountMinor: 1500 }), actor })).toEqual({ ok: false, code: "too_much", refundableMinor: 1000 });
    expect(db.refundRequest.create).not.toHaveBeenCalled();
    const nothing = fakeDb({ order: { name: "#1", totalMinor: 1000, refundedMinor: 1000 } });
    expect((await addRefundRequest(nothing, { shop: SHOP, orderId: ORDER, input: input({ type: "full", amountMinor: null }), actor })).code).toBe("too_much");
  });

  it("refuses an order the app has not copied yet and a line that is not on the order", async () => {
    expect((await addRefundRequest(fakeDb({ order: null }), { shop: SHOP, orderId: ORDER, input: input(), actor })).code).toBe("no_order");
    const db = fakeDb({ lineCount: 0 });
    expect((await addRefundRequest(db, { shop: SHOP, orderId: ORDER, input: input(), actor })).code).toBe("no_line");
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });

  it("returns the earlier request when the same key is sent twice, creating nothing", async () => {
    const earlier = { id: "r0", clientKey: "k1", reason: "DamagedPartRefund", type: "part", amountMinor: 2500, lineIds: [], notes: "", status: "requested", createdByName: "Sam Patel", createdAt: new Date("2026-11-21T09:00:00Z") };
    const db = fakeDb({ existing: earlier });
    const res = await addRefundRequest(db, { shop: SHOP, orderId: ORDER, input: input(), actor });
    expect(res).toMatchObject({ ok: true, request: { id: "r0" }, duplicate: true });
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });
});

describe("listRefundRequests", () => {
  it("lists the order's requests newest first with what is still refundable", async () => {
    const row = { id: "r1", reason: "DelayRefund", type: "part", amountMinor: 2000, lineIds: [], notes: "", status: "requested", createdByName: "Sam", createdAt: new Date("2026-11-21T10:00:00Z") };
    const db = fakeDb({ rows: [row], requestedSum: 2000 });
    const res = await listRefundRequests(db, SHOP, ORDER);
    expect(db.refundRequest.findMany.mock.calls[0][0]).toMatchObject({ where: { shop: SHOP, orderId: ORDER }, orderBy: { createdAt: "desc" } });
    expect(res).toEqual({ requests: [{ id: "r1", reason: "DelayRefund", type: "part", amountMinor: 2000, lineIds: [], notes: "", status: "requested", createdByName: "Sam", createdAt: "2026-11-21T10:00:00.000Z" }], refundableMinor: 7000 });
  });
  it("says nothing is refundable when the order is not copied yet", async () => {
    expect((await listRefundRequests(fakeDb({ order: null }), SHOP, ORDER)).refundableMinor).toBe(0);
  });
});
