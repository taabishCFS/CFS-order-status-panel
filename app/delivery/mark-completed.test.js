import { describe, expect, it, vi } from "vitest";
import { markCompleted } from "./mark-completed.server.js";
import { readBookedRequest } from "./booked-delivery-rules.js";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam Patel", source: "staff-member" };
const O1 = "gid://shopify/Order/1";
const O2 = "gid://shopify/Order/2";
const emptyState = () => ({ history: [], lines: {}, totalEntries: 0 });

function fakeDb() {
  const lines = [
    { lineId: "L1", orderId: O1, quantity: 1 },
    { lineId: "L2", orderId: O1, quantity: 1 },
    { lineId: "L3", orderId: O2, quantity: 1 },
  ];
  return {
    orderLine: { findMany: async ({ where }) => lines.filter((l) => l.quantity > 0 && (where.lineId ? where.lineId.in.includes(l.lineId) : l.orderId === where.orderId)) },
    order: { findMany: async () => [{ orderId: O1, name: "#1" }, { orderId: O2, name: "#2" }] },
  };
}
function deps(over = {}) {
  const written = {};
  return {
    written,
    deps: {
      load: vi.fn(async () => ({ state: emptyState(), digest: "d" })),
      commit: vi.fn(async (orderId, _c, next) => {
        written[orderId] = next;
        return over.fail === orderId ? { ok: false, reason: "stale", message: "x" } : { ok: true, digest: "d2" };
      }),
      sync: vi.fn(async () => undefined),
      queue: vi.fn(async () => over.queue ?? { ok: true, rows: [{ kind: "customer", recipient: "a@b.c" }] }),
      now: () => "2026-11-25T10:00:00.000Z",
      newId: (() => {
        let n = 0;
        return () => `e${(n += 1)}`;
      })(),
    },
  };
}
const run = (d, extra = {}) =>
  markCompleted(fakeDb(), { shop: SHOP, graphql: vi.fn(), lineIds: ["L1", "L2", "L3"], email: false, actor, config: { enabled: true }, deps: d.deps, ...extra });

describe("markCompleted (server)", () => {
  it("sets Completed on the ticked lines of each order, syncs, and does not email by default", async () => {
    const d = deps();
    const r = await run(d);
    expect(r).toMatchObject({ ok: true, saved: [{ orderId: O1, name: "#1" }, { orderId: O2, name: "#2" }], failed: [], emailed: 0 });
    expect(d.written[O1].lines.L1.statusId).toBe(6);
    expect(d.written[O1].lines.L2.statusId).toBe(6);
    expect(d.written[O2].lines.L3.statusId).toBe(6);
    expect(d.deps.sync).toHaveBeenCalledTimes(2);
    expect(d.deps.queue).not.toHaveBeenCalled();
  });
  it("queues one Completed status email per order when asked", async () => {
    const d = deps();
    const r = await run(d, { email: true });
    expect(r.emailed).toBe(2);
    expect(d.deps.queue).toHaveBeenCalledTimes(2);
    expect(d.deps.queue.mock.calls[0][0]).toMatchObject({ orderId: O1, request: { statusId: 6, lineIds: ["L1", "L2"], idempotencyKey: "e1" } });
  });
  it("a failed save is reported and the other order still goes ahead", async () => {
    const d = deps({ fail: O1 });
    const r = await run(d, { email: true });
    expect(r.saved).toEqual([{ orderId: O2, name: "#2" }]);
    expect(r.failed).toEqual([{ orderId: O1, name: "#1", message: "Someone else changed this order. Open it and try again." }]);
    expect(d.deps.queue).toHaveBeenCalledTimes(1);
  });
  it("an email that cannot be queued does not undo the status", async () => {
    const d = deps({ queue: { ok: false, code: "email_off" } });
    const r = await run(d, { email: true });
    expect(r.saved).toHaveLength(2);
    expect(r.emailProblems).toEqual(["customer email is turned off", "customer email is turned off"]);
  });
  it("says when an order has no customer address", async () => {
    const d = deps({ queue: { ok: true, rows: [{ kind: "internal_copy", recipient: "x@y.z" }] } });
    expect((await run(d, { email: true })).emailProblems).toEqual(["#1 has no customer email address", "#2 has no customer email address"]);
  });
  it("writes the sentence to show", async () => {
    expect((await run(deps())).text).toBe("Marked Completed: 2 orders. The customers were not emailed.");
    expect((await run(deps(), { email: true })).text).toBe("Marked Completed: 2 orders. 2 customer emails queued.");
    const failed = await run(deps({ fail: O1, queue: { ok: false, code: "email_off" } }), { email: true });
    expect(failed.text).toBe("Marked Completed: 1 order. 0 customer emails queued. Not emailed: customer email is turned off. Not saved: #1: Someone else changed this order. Open it and try again.");
  });
  it("no matching lines is refused", async () => {
    const d = deps();
    const empty = { orderLine: { findMany: async () => [] }, order: { findMany: async () => [] } };
    const r = await markCompleted(empty, { shop: SHOP, graphql: vi.fn(), lineIds: ["zz"], email: false, actor, config: {}, deps: d.deps });
    expect(r).toEqual({ ok: false, code: "no_lines" });
  });
  it("reads the complete action", () => {
    expect(readBookedRequest({ action: "complete", lineIds: ["a", "a"], email: true }).value).toEqual({ action: "complete", lineIds: ["a"], email: true });
    expect(readBookedRequest({ action: "complete", lineIds: [] }).error).toBe("bad_request");
    expect(readBookedRequest({ action: "complete", lineIds: ["a"] }).value.email).toBe(false);
  });
});
