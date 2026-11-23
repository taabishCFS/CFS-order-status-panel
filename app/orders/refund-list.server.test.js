import { describe, expect, it, vi } from "vitest";
import { addManualRefund, exportRows, listRefunds, markRefunded, removeRefunds, setClaimable } from "./refund-list.server.js";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam Patel" };
const req = (over = {}) => ({
  id: "r1", shop: SHOP, orderId: "gid://shopify/Order/1", orderName: "#1001", reason: "DamagedPartRefund", type: "part", amountMinor: 2500, lineIds: [], notes: "Leg snapped",
  status: "requested", createdByName: "Sam", createdAt: new Date("2026-11-20T10:00:00Z"), transactionId: null, refundedAt: null, refundedByName: null, claimable: null, manual: false, removedAt: null, removedByName: null, ...over,
});
const order = (over = {}) => ({ orderId: "gid://shopify/Order/1", name: "#1001", createdAt: new Date("2026-11-10T09:00:00Z"), gateway: "shopify_payments", totalMinor: 10000, outstandingMinor: 0, currency: "GBP", site: "CFS", email: "a@b.com", brands: ["Actona"], billingAddress: JSON.stringify({ name: "Ann Lee", city: "Leeds" }), ...over });

function fakeDb({ rows = [req()], total = rows.length, orders = [order()], found = req(), orderFound = order() } = {}) {
  return {
    refundRequest: {
      count: vi.fn(async () => total),
      findMany: vi.fn(async () => rows),
      findFirst: vi.fn(async () => found),
      update: vi.fn(async ({ data }) => ({ ...(found ?? req()), ...data })),
      updateMany: vi.fn(async () => ({ count: 2 })),
      create: vi.fn(async ({ data }) => ({ id: "m1", createdAt: new Date("2026-11-23T10:00:00Z"), lineIds: [], ...data })),
    },
    order: { findMany: vi.fn(async () => orders), findFirst: vi.fn(async () => orderFound) },
  };
}
const params = (over = {}) => ({ page: 1, all: false, from: null, to: null, q: "", view: null, sort: null, dir: "desc", ...over });

describe("listRefunds", () => {
  it("lists pending requests with the order's paid amount, gateway and date, 50 a page", async () => {
    const db = fakeDb({ total: 120, orders: [order({ outstandingMinor: 4000 })] });
    const res = await listRefunds(db, SHOP, params({ page: 2 }));
    expect(db.refundRequest.findMany.mock.calls[0][0]).toMatchObject({ where: { shop: SHOP, AND: [{ status: "requested" }] }, skip: 50, take: 50 });
    expect(res).toMatchObject({ total: 120, page: 2, pageCount: 3, view: "pending", capped: false });
    expect(res.rows[0]).toMatchObject({ id: "r1", orderName: "#1001", orderDate: "2026-11-10T09:00:00.000Z", reason: "DamagedPartRefund", amountMinor: 2500, paidMinor: 6000, currency: "GBP", gateway: "shopify_payments", status: "requested", claimableApplies: true, addedBy: "Sam" });
  });
  it("still lists a request whose order is not copied yet, with no paid amount", async () => {
    const res = await listRefunds(fakeDb({ orders: [] }), SHOP, params());
    expect(res.rows[0]).toMatchObject({ orderName: "#1001", paidMinor: null, gateway: null });
  });
  it("caps All at 2000 and says so", async () => {
    const db = fakeDb({ total: 2500 });
    const res = await listRefunds(db, SHOP, params({ all: true }));
    expect(db.refundRequest.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 2000 });
    expect(res).toMatchObject({ capped: true, pageCount: 1, page: 1 });
  });
});

describe("markRefunded (legacy: Save the transaction id, which marks the request refunded)", () => {
  it("marks a pending request done with the id, the time and who", async () => {
    const db = fakeDb();
    const res = await markRefunded(db, { shop: SHOP, id: "r1", transactionId: " TX-123 ", actor, now: new Date("2026-11-23T11:00:00Z") });
    expect(res).toMatchObject({ ok: true, request: { id: "r1", orderId: "gid://shopify/Order/1", amountMinor: 2500, transactionId: "TX-123" } });
    expect(db.refundRequest.update.mock.calls[0][0]).toEqual({ where: { id: "r1" }, data: { status: "done", transactionId: "TX-123", refundedAt: new Date("2026-11-23T11:00:00Z"), refundedByName: "Sam Patel" } });
  });
  it("completes a manual entry that is done but has no transaction id", async () => {
    const db = fakeDb({ found: req({ status: "done", manual: true }) });
    expect((await markRefunded(db, { shop: SHOP, id: "r1", transactionId: "TX-9", actor })).ok).toBe(true);
  });
  it("refuses a blank id, an unknown or removed request, and one already refunded with an id", async () => {
    expect((await markRefunded(fakeDb(), { shop: SHOP, id: "r1", transactionId: "  ", actor })).code).toBe("bad_transaction_id");
    expect((await markRefunded(fakeDb({ found: null }), { shop: SHOP, id: "x", transactionId: "T1", actor })).code).toBe("no_request");
    expect((await markRefunded(fakeDb({ found: req({ status: "cancelled" }) }), { shop: SHOP, id: "r1", transactionId: "T1", actor })).code).toBe("no_request");
    const done = fakeDb({ found: req({ status: "done", transactionId: "OLD" }) });
    expect((await markRefunded(done, { shop: SHOP, id: "r1", transactionId: "T1", actor })).code).toBe("already_refunded");
    expect(done.refundRequest.update).not.toHaveBeenCalled();
  });
});

describe("setClaimable", () => {
  it("saves the choice on a refunded damaged request", async () => {
    const db = fakeDb({ found: req({ status: "done" }) });
    expect((await setClaimable(db, { shop: SHOP, id: "r1", value: "claimable" })).ok).toBe(true);
    expect(db.refundRequest.update.mock.calls[0][0]).toEqual({ where: { id: "r1" }, data: { claimable: "claimable" } });
    await setClaimable(db, { shop: SHOP, id: "r1", value: "" });
    expect(db.refundRequest.update.mock.calls[1][0].data).toEqual({ claimable: null });
  });
  it("refuses a bad value, a pending request, and a reason it does not apply to", async () => {
    expect((await setClaimable(fakeDb({ found: req({ status: "done" }) }), { shop: SHOP, id: "r1", value: "maybe" })).code).toBe("bad_value");
    expect((await setClaimable(fakeDb(), { shop: SHOP, id: "r1", value: "claimable" })).code).toBe("not_applicable");
    expect((await setClaimable(fakeDb({ found: req({ status: "done", reason: "Change_of_Mind" }) }), { shop: SHOP, id: "r1", value: "claimable" })).code).toBe("not_applicable");
    expect((await setClaimable(fakeDb({ found: null }), { shop: SHOP, id: "r1", value: "claimable" })).code).toBe("no_request");
  });
});

describe("removeRefunds (legacy: ticked rows leave the list; kept as removed, who and when)", () => {
  it("cancels the ticked requests in this shop and says how many", async () => {
    const db = fakeDb();
    const res = await removeRefunds(db, { shop: SHOP, ids: ["r1", "r2"], actor, now: new Date("2026-11-23T11:00:00Z") });
    expect(res).toEqual({ ok: true, count: 2 });
    expect(db.refundRequest.updateMany.mock.calls[0][0]).toEqual({ where: { shop: SHOP, id: { in: ["r1", "r2"] }, status: { in: ["requested", "done"] } }, data: { status: "cancelled", removedAt: new Date("2026-11-23T11:00:00Z"), removedByName: "Sam Patel" } });
  });
  it("refuses an empty selection", async () => expect((await removeRefunds(fakeDb(), { shop: SHOP, ids: [], actor })).code).toBe("nothing_selected"));
});

describe("addManualRefund (legacy Add Order: an entry already refunded)", () => {
  const input = (over = {}) => ({ clientKey: "k1", orderName: "1001", reason: "DelayRefund", type: "full", amountMinor: 5000, notes: "Phoned in", transactionId: "", ...over });
  it("adds a done manual entry marked Manual Add, with no refund date until a transaction id is saved", async () => {
    const db = fakeDb({ found: null });
    const res = await addManualRefund(db, { shop: SHOP, input: input(), actor });
    expect(res.ok).toBe(true);
    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ shop: SHOP, name: { in: ["#1001", "1001"] } });
    expect(db.refundRequest.create.mock.calls[0][0].data).toMatchObject({ shop: SHOP, orderId: "gid://shopify/Order/1", orderName: "#1001", clientKey: "manual-k1", reason: "DelayRefund", type: "full", amountMinor: 5000, notes: "Phoned in", status: "done", manual: true, createdByName: "Sam Patel- Manual Add", transactionId: null, refundedAt: null });
  });
  it("keeps a transaction id given at entry and dates the refund then", async () => {
    const db = fakeDb({ found: null });
    await addManualRefund(db, { shop: SHOP, input: input({ transactionId: "TX-1" }), actor, now: new Date("2026-11-23T11:00:00Z") });
    expect(db.refundRequest.create.mock.calls[0][0].data).toMatchObject({ transactionId: "TX-1", refundedAt: new Date("2026-11-23T11:00:00Z"), refundedByName: "Sam Patel" });
  });
  it("says when no order has that number", async () => {
    const db = fakeDb({ found: null, orderFound: null });
    expect((await addManualRefund(db, { shop: SHOP, input: input(), actor })).code).toBe("no_order");
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });
  it("returns the earlier entry when the same key is sent twice", async () => {
    const db = fakeDb({ found: req({ id: "m0", manual: true }) });
    const res = await addManualRefund(db, { shop: SHOP, input: input(), actor });
    expect(res).toMatchObject({ ok: true, duplicate: true });
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });
});

describe("exportRows", () => {
  it("loads the ticked requests with order details for the CSV", async () => {
    const db = fakeDb({ rows: [req({ status: "done", refundedAt: new Date("2026-11-21T10:00:00Z"), createdByName: "Sam" })] });
    const rows = await exportRows(db, SHOP, { ids: ["r1"] });
    expect(db.refundRequest.findMany.mock.calls[0][0].where).toEqual({ shop: SHOP, id: { in: ["r1"] }, status: { in: ["requested", "done"] } });
    expect(rows[0]).toMatchObject({ orderName: "#1001", payMode: "shopify_payments", amountMinor: 2500, type: "part", reason: "DamagedPartRefund", refunded: "Yes", operator: "Sam", brands: ["Actona"], email: "a@b.com", billing: { name: "Ann Lee", city: "Leeds" } });
  });
  it("uses the filters of the list when asked for everything shown", async () => {
    const db = fakeDb();
    await exportRows(db, SHOP, { params: params({ view: "refunded" }) });
    expect(db.refundRequest.findMany.mock.calls[0][0].where).toEqual({ shop: SHOP, AND: [{ status: "done" }] });
  });
  it("takes refunds dated between two days for Xero, newest first", async () => {
    const db = fakeDb();
    await exportRows(db, SHOP, { refundedFrom: "2026-11-01", refundedTo: "2026-11-21" });
    expect(db.refundRequest.findMany.mock.calls[0][0]).toMatchObject({ where: { shop: SHOP, status: "done", refundedAt: { gte: new Date("2026-11-01T00:00:00.000Z"), lte: new Date("2026-11-21T23:59:59.999Z") } }, orderBy: { refundedAt: "desc" } });
  });
});
