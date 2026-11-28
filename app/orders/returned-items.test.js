import { describe, expect, it } from "vitest";
import { listReturnedItems, markReturnAction, parseReturnedParams, readMarkInput } from "./returned-items.server.js";
import { readStatusState } from "./status-state.js";

const L = (n) => `gid://shopify/LineItem/${n}`;
const O = (n) => `gid://shopify/Order/${n}`;

function fakeDb({ lines = [], orders = [], actions = [] } = {}) {
  const seen = {};
  return {
    seen,
    actions,
    order: { findMany: async ({ where }) => (where.name ? orders.filter((o) => o.name.toLowerCase().includes(where.name.contains.toLowerCase())) : orders.filter((o) => where.orderId.in.includes(o.orderId))) },
    orderLine: {
      count: async ({ where }) => { seen.where = where; return lines.filter((l) => l.lineStatusId === where.lineStatusId && (!where.orderId || where.orderId.in.includes(l.orderId))).length; },
      findMany: async ({ where }) => lines.filter((l) => l.lineStatusId === (where.lineStatusId ?? 7) && (!where.orderId || where.orderId.in.includes(l.orderId)) && (!where.lineId || where.lineId.in.includes(l.lineId))),
    },
    lineReturnAction: {
      findMany: async () => actions,
      upsert: async ({ where, create, update }) => { const f = actions.find((a) => a.lineId === where.shop_lineId.lineId); if (f) Object.assign(f, update); else actions.push({ ...create }); },
    },
  };
}

describe("Returned Items", () => {
  it("reads the cancel reason from the saved status, only while the line is Cancelled", () => {
    const value = JSON.stringify({ lines: { A: { statusId: 7, extras: { cancelReason: "Changed mind" } }, B: { statusId: 4, extras: { cancelReason: "old" } } } });
    const r = readStatusState(value);
    expect(r.lines.A.cancelReason).toBe("Changed mind");
    expect(r.lines.B.cancelReason).toBe(null);
  });
  it("reads the page parameters", () => {
    expect(parseReturnedParams(new URLSearchParams("page=2&q=%231038"))).toEqual({ page: 2, q: "1038" });
    expect(parseReturnedParams(new URLSearchParams("page=-1"))).toEqual({ page: 1, q: "" });
  });
  it("lists cancelled lines with order number, reason and the action taken", async () => {
    const lines = [
      { lineId: L(1), orderId: O(1), title: "Bed", variantTitle: "4ft6", sku: "B1", quantity: 1, vendor: "Duke", lineStatusId: 7, cancelReason: "Damaged", orderCreatedAt: new Date("2026-11-20") },
      { lineId: L(2), orderId: O(2), title: "Chair", variantTitle: null, sku: null, quantity: 2, vendor: null, lineStatusId: 7, cancelReason: null, orderCreatedAt: new Date("2026-11-21") },
    ];
    const db = fakeDb({ lines, orders: [{ orderId: O(1), name: "#1001" }, { orderId: O(2), name: "#1002" }], actions: [{ lineId: L(1), action: "Dispose", byName: "Sam", updatedAt: new Date("2026-11-25") }] });
    const r = await listReturnedItems(db, "s", { page: 1, q: "" });
    expect(r.total).toBe(2);
    expect(r.rows[0]).toMatchObject({ orderName: "#1001", reason: "Damaged", sku: "B1", action: "Dispose", actionLabel: "Dispose", actionBy: "Sam" });
    expect(r.rows[1]).toMatchObject({ orderName: "#1002", reason: "", sku: "", action: null, actionLabel: "" });
    const found = await listReturnedItems(db, "s", { page: 1, q: "1002" });
    expect(found.rows.map((x) => x.orderName)).toEqual(["#1002"]);
  });
  it("checks a mark request", () => {
    expect(readMarkInput({ lineIds: [L(1), L(1)], action: "Clearance" })).toEqual({ value: { lineIds: [L(1)], action: "Clearance" } });
    expect(readMarkInput({ lineIds: [L(1)], action: "Burn" })).toEqual({ error: "bad_action" });
    expect(readMarkInput({ lineIds: [], action: "Clearance" })).toEqual({ error: "bad_request" });
    expect(readMarkInput({ lineIds: ["x"], action: "Clearance" })).toEqual({ error: "bad_request" });
  });
  it("marks only lines that are still Cancelled, and changes an earlier action", async () => {
    const lines = [{ lineId: L(1), orderId: O(1), lineStatusId: 7 }, { lineId: L(2), orderId: O(1), lineStatusId: 4 }];
    const db = fakeDb({ lines, actions: [{ lineId: L(1), action: "Dispose", byName: "Sam" }] });
    expect(await markReturnAction(db, "s", { lineIds: [L(1), L(2)], action: "FreeStock" }, { name: "Ali" })).toEqual({ ok: true, marked: 1, skipped: 1 });
    expect(db.actions).toEqual([{ lineId: L(1), action: "FreeStock", byName: "Ali", orderId: O(1) }]);
  });
});
