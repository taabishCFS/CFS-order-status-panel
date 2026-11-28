import { describe, expect, it } from "vitest";
import { changeCallers, feedbackCsv, listFeedbackCalls, parseFeedbackParams, readCallSave, saveCallField, shareOut } from "./feedback-calling.server.js";
import { readStatusState } from "./status-state.js";

const O = (n) => `gid://shopify/Order/${n}`;
const NOW = new Date("2026-11-28T12:00:00Z");

function fakeDb({ orders = [], lines = [], calls = [], callers = [] } = {}) {
  return {
    calls,
    callers,
    order: {
      findMany: async () => orders,
      findFirst: async ({ where }) => orders.find((o) => o.orderId === where.orderId) ?? null,
    },
    orderLine: { findMany: async ({ where }) => lines.filter((l) => where.orderId.in.includes(l.orderId)) },
    feedbackCall: {
      findMany: async ({ where }) => calls.filter((c) => where.orderId.in.includes(c.orderId)),
      upsert: async ({ where, create, update }) => { const f = calls.find((c) => c.orderId === where.shop_orderId.orderId); if (f) Object.assign(f, update); else calls.push({ ...create }); },
    },
    feedbackCaller: {
      findMany: async () => [...callers].sort((a, b) => a.createdAt - b.createdAt),
      createMany: async ({ data }) => { callers.push(...data); },
      create: async ({ data }) => { callers.push({ ...data, createdAt: new Date() }); },
      delete: async ({ where }) => { callers.splice(callers.findIndex((c) => c.name === where.shop_name.name), 1); },
    },
  };
}

const order = (n, extra = {}) => ({ orderId: O(n), name: `#${1000 + n}`, createdAt: new Date(`2026-11-${10 + n}T10:00:00Z`), postcode: "LE1 3LR", ...extra });
const line = (n, completedDate, lineStatusId = 6) => ({ orderId: O(n), lineStatusId, completedDate });

describe("Feedback Calling", () => {
  it("keeps the day each line was Completed, in UK time", () => {
    const r = readStatusState(JSON.stringify({ lines: { A: { statusId: 6, at: "2026-07-01T23:30:00Z" }, B: { statusId: 4, at: "2026-07-01T10:00:00Z" } } }));
    expect(r.lines.A.completedDate).toBe("2026-07-02");
    expect(r.lines.B.completedDate).toBe(null);
  });
  it("reads the dates: none is today, one is that day", () => {
    expect(parseFeedbackParams(new URLSearchParams(""), NOW)).toMatchObject({ from: "2026-11-28", to: "2026-11-28" });
    expect(parseFeedbackParams(new URLSearchParams("from=2026-11-20"), NOW)).toMatchObject({ from: "2026-11-20", to: "2026-11-20" });
    expect(parseFeedbackParams(new URLSearchParams("from=2026-11-25&to=2026-11-20&q=%231038&staff=Vinod"), NOW)).toMatchObject({ from: "2026-11-20", to: "2026-11-25", q: "1038", staff: "Vinod" });
  });

  const orders = [order(1), order(2), order(3, { postcode: "NE1 1AA" }), order(4)];
  const lines = [line(1, "2026-11-20"), line(1, "2026-11-22"), line(2, "2026-11-25"), line(3, null), line(4, "2026-11-22"), line(4, null, 3)];

  it("lists fully completed orders by their completed day, unknown days always", async () => {
    const db = fakeDb({ orders, lines, calls: [{ orderId: O(1), staff: "Vinod", callStatus: "Pending", remark: "No answer" }] });
    const r = await listFeedbackCalls(db, "s", parseFeedbackParams(new URLSearchParams("from=2026-11-21&to=2026-11-23"), NOW));
    // #1001 last completed 22nd; #1003 unknown day; #1002 is the 25th; #1004 still has an item in progress.
    expect(r.rows.map((x) => x.orderName)).toEqual(["#1001", "#1003"]);
    expect(r.rows[0]).toMatchObject({ completedDate: "2026-11-22", month: "November", allocDate: "2026-11-23", staff: "Vinod", callStatus: "Pending", remark: "No answer" });
    expect(r.callers).toEqual(["Hameed", "Harris", "Shree", "Tabshir", "Vinod", "Shezi"]);
    const byPostcode = await listFeedbackCalls(db, "s", parseFeedbackParams(new URLSearchParams("from=2026-11-01&to=2026-11-30&q=ne11aa"), NOW));
    expect(byPostcode.rows.map((x) => x.orderName)).toEqual(["#1003"]);
    const byStaff = await listFeedbackCalls(db, "s", parseFeedbackParams(new URLSearchParams("from=2026-11-01&to=2026-11-30&staff=Vinod"), NOW));
    expect(byStaff.rows.map((x) => x.orderName)).toEqual(["#1001"]);
  });

  it("checks and saves one call detail", async () => {
    const callers = ["Vinod"];
    expect(readCallSave({ orderId: O(1), field: "callStatus", value: "Completed" }, callers)).toEqual({ value: { orderId: O(1), field: "callStatus", value: "Completed" } });
    expect(readCallSave({ orderId: O(1), field: "staff", value: "" }, callers)).toEqual({ value: { orderId: O(1), field: "staff", value: null } });
    expect(readCallSave({ orderId: O(1), field: "staff", value: "Nobody" }, callers)).toEqual({ error: "bad_staff" });
    expect(readCallSave({ orderId: O(1), field: "callDate", value: "2026-02-30" }, callers)).toEqual({ error: "bad_date" });
    expect(readCallSave({ orderId: O(1), field: "orderName", value: "x" }, callers)).toEqual({ error: "bad_request" });
    expect(readCallSave({ orderId: O(1), field: "rating", value: "x".repeat(51) }, callers)).toEqual({ error: "too_long" });
    const db = fakeDb({ orders });
    expect(await saveCallField(db, "s", { orderId: O(1), field: "rating", value: "5 stars" }, { name: "Ali" })).toEqual({ ok: true });
    expect(db.calls[0]).toMatchObject({ orderId: O(1), orderName: "#1001", rating: "5 stars", updatedByName: "Ali" });
    expect(await saveCallField(db, "s", { orderId: O(99), field: "rating", value: "x" }, { name: "Ali" })).toEqual({ ok: false, error: "not_found" });
  });

  it("shares unassigned orders among the callers, starting again each day", async () => {
    const os = [order(1), order(2), order(3), order(4)];
    const ls = [line(1, "2026-11-20"), line(2, "2026-11-20"), line(3, "2026-11-20"), line(4, "2026-11-21")];
    const callers = [{ name: "A", createdAt: new Date(1) }, { name: "B", createdAt: new Date(2) }];
    const db = fakeDb({ orders: os, lines: ls, callers, calls: [{ orderId: O(2), staff: "B" }] });
    const p = parseFeedbackParams(new URLSearchParams("from=2026-11-20&to=2026-11-21"), NOW);
    expect(await shareOut(db, "s", p, { name: "Ali" })).toEqual({ ok: true, assigned: 3 });
    const staffOf = Object.fromEntries(db.calls.map((c) => [c.orderId, c.staff]));
    expect(staffOf).toEqual({ [O(1)]: "A", [O(2)]: "B", [O(3)]: "B", [O(4)]: "A" });
  });

  it("adds and removes callers, but keeps at least one", async () => {
    const callers = [{ name: "A", createdAt: new Date(1) }];
    const db = fakeDb({ callers });
    expect(await changeCallers(db, "s", { add: "  New   Person " })).toEqual({ ok: true, callers: ["A", "New Person"] });
    expect(await changeCallers(db, "s", { add: "a" })).toEqual({ ok: false, error: "exists" });
    expect(await changeCallers(db, "s", { remove: "A" })).toEqual({ ok: true, callers: ["New Person"] });
    expect(await changeCallers(db, "s", { remove: "New Person" })).toEqual({ ok: false, error: "last_caller" });
  });

  it("downloads the table", async () => {
    const db = fakeDb({ orders: [order(1)], lines: [line(1, "2026-11-22")], calls: [{ orderId: O(1), staff: "Vinod", callDate: "2026-11-24", remark: "Happy, \"great\"" }] });
    const out = await feedbackCsv(db, "s", parseFeedbackParams(new URLSearchParams("from=2026-11-22"), NOW));
    const [head, row] = out.csv.replace("﻿", "").split("\r\n");
    expect(head).toBe("Order Date,Completed Date,Order No.,Month,Alloc.Date,Calling Date,Staff,Call Status,Remark,Remark 2,Rating Recv,Rating Date");
    expect(row).toBe('11/11/2026,22/11/2026,#1001,November,23/11/2026,24/11/2026,Vinod,,"Happy, ""great""",,,');
    expect(out.fileName).toBe("Feedback-Calling-22-11-2026.csv");
  });
});
