import { describe, expect, it, vi } from "vitest";
import { answerConfirm, confirmLink, issueConfirmLink, loadConfirmPage, longDate, readConfirmForm, rescheduleToDate, sendNotConfirmed, TOKEN, writeOutcome } from "./delivery-confirm.server.js";
import { answeredPage, confirmPage, esc } from "./delivery-confirm-page.js";
import { readFollowUp } from "./delivery-followup-rules.js";
import { UPGRADES } from "../email/seed/index.server.js";
import { BOOKING_CONFIRMATION_BODY, OTHER_TEMPLATES } from "../email/seed/other-templates.js";

const SHOP = "s.myshopify.com";
const T = "a".repeat(48);

// A small in-memory stand-in for the tables these functions use.
function fakeDb({ bookings = [], lines = [], orders = [] } = {}) {
  const match = (row, where) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
      return row[k] === v;
    });
  const history = [];
  let n = 0;
  return {
    history,
    bookings,
    deliveryBooking: {
      findMany: async ({ where }) => bookings.filter((b) => match(b, where)),
      updateMany: async ({ where, data }) => {
        const hit = bookings.filter((b) => match(b, where));
        hit.forEach((b) => Object.assign(b, data));
        return { count: hit.length };
      },
      update: async ({ where, data }) => Object.assign(bookings.find((b) => b.id === where.id), data),
      create: async ({ data }) => {
        const row = { id: `new${(n += 1)}`, vanId: null, driverId: null, drop: null, amPm: null, ...data };
        bookings.push(row);
        return row;
      },
    },
    deliveryHistory: { create: async ({ data }) => history.push(data) },
    orderLine: { findMany: async ({ where }) => lines.filter((l) => match(l, where)) },
    order: { findUnique: async ({ where }) => orders.find((o) => o.orderId === where.shop_orderId.orderId) ?? null },
    driver: { findMany: async () => [] },
    van: { findMany: async () => [] },
    deliverySlot: { findMany: async () => [] },
  };
}

const booking = (lineId, extra = {}) => ({ id: `b-${lineId}`, shop: SHOP, orderId: "o1", lineId, partner: "TNT", date: "2026-11-30", amPm: "AM", vanId: null, driverId: null, drop: null, confirmToken: T, confirmedAt: null, confirmNote: null, ...extra });
const line = (lineId, extra = {}) => ({ shop: SHOP, orderId: "o1", lineId, title: `Item ${lineId}`, variantTitle: "Grey", quantity: 1, deliveryOutcome: null, ...extra });
const ORDER = { orderId: "o1", name: "#1038", customerName: "Taabish Shaikh", cancelledAt: null };

describe("confirm link", () => {
  it("is on the shop's own website, with a 48-character token", async () => {
    const db = fakeDb({ bookings: [booking("l1", { confirmToken: null }), booking("l2", { confirmToken: null })] });
    const link = await issueConfirmLink(db, { shop: SHOP, lineIds: ["l1"], newToken: () => T });
    expect(link).toBe(`https://${SHOP}/apps/cfs-delivery/delivery-confirm?t=${T}`);
    expect(db.bookings.map((b) => b.confirmToken)).toEqual([T, null]);
    expect(TOKEN.test(confirmLink(SHOP, T).split("t=")[1])).toBe(true);
  });
});

describe("loadConfirmPage", () => {
  it("lists the items still to answer and the ones already answered", async () => {
    const db = fakeDb({
      bookings: [booking("l1"), booking("l2", { confirmedAt: new Date() })],
      lines: [line("l1"), line("l2", { deliveryOutcome: "confirmed" })],
      orders: [ORDER],
    });
    const page = await loadConfirmPage(db, { shop: SHOP, token: T });
    expect(page.state).toBe("open");
    expect(page.order).toEqual({ name: "#1038", firstName: "Taabish" });
    expect(page.open.map((i) => i.lineId)).toEqual(["l1"]);
    expect(page.open[0]).toMatchObject({ date: "30/11/2026", dateLong: "Monday 30 November 2026", slot: "AM", options: "Grey" });
    expect(page.answered[0].answer).toBe("confirmed");
  });

  it("refuses a bad or replaced token", async () => {
    const db = fakeDb({ bookings: [booking("l1")], lines: [line("l1")], orders: [ORDER] });
    expect(await loadConfirmPage(db, { shop: SHOP, token: "nope" })).toEqual({ state: "invalid" });
    expect(await loadConfirmPage(db, { shop: SHOP, token: "b".repeat(48) })).toEqual({ state: "invalid" });
  });
});

describe("readConfirmForm", () => {
  const form = (pairs) => {
    const f = new FormData();
    for (const [k, v] of pairs) f.append(k, v);
    return f;
  };
  it("reads the answer, the ticked lines and the note", () => {
    expect(readConfirmForm(form([["answer", "agree"], ["line", "l1"], ["line", "l2"], ["note", " ring first "]]))).toEqual({ value: { answer: "agree", lineIds: ["l1", "l2"], note: "ring first" } });
  });
  it("needs an answer and at least one line", () => {
    expect(readConfirmForm(form([["line", "l1"]]))).toEqual({ error: "answer" });
    expect(readConfirmForm(form([["answer", "disagree"]]))).toEqual({ error: "no_lines" });
  });
});

describe("answerConfirm", () => {
  const setup = () => fakeDb({ bookings: [booking("l1"), booking("l2")], lines: [line("l1"), line("l2")], orders: [ORDER] });

  it("Agree saves Confirmed by the customer on the ticked lines only, keeps the note, and sends no email", async () => {
    const db = setup();
    const write = vi.fn(async () => ({ ok: true, changed: true }));
    const queue = vi.fn();
    const r = await answerConfirm(db, { shop: SHOP, token: T, form: { answer: "agree", lineIds: ["l1"], note: "Ring first" }, deps: { write, sync: async () => {}, queue } });
    expect(r).toEqual({ ok: true, answer: "confirmed", emailed: false });
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", lineIds: ["l1"], outcome: "confirmed", actor: expect.objectContaining({ name: "By Customer" }) }));
    expect(db.bookings[0]).toMatchObject({ confirmNote: "Ring first", confirmedAt: expect.any(Date) });
    expect(db.bookings[1].confirmedAt).toBeNull();
    expect(db.history).toEqual([expect.objectContaining({ action: "customer_confirmed", lineId: "l1", reason: "Ring first", actorName: "By Customer" })]);
    expect(queue).not.toHaveBeenCalled();
  });

  it("Disagree saves Declined and sends the legacy email", async () => {
    const db = setup();
    const queue = vi.fn(async () => ({ ok: true }));
    const r = await answerConfirm(db, { shop: SHOP, token: T, form: { answer: "disagree", lineIds: ["l1", "l2"], note: "" }, deps: { write: async () => ({ ok: true }), sync: async () => {}, queue } });
    expect(r).toEqual({ ok: true, answer: "declined", emailed: true });
    expect(queue).toHaveBeenCalledWith({ orderId: "o1", lineIds: ["l1", "l2"] });
    expect(db.history.map((h) => h.action)).toEqual(["customer_declined", "customer_declined"]);
  });

  it("an item can be answered once; a failed save changes nothing", async () => {
    const db = setup();
    db.bookings[0].confirmedAt = new Date();
    expect(await answerConfirm(db, { shop: SHOP, token: T, form: { answer: "agree", lineIds: ["l1"], note: "" }, deps: { write: async () => ({ ok: true }), sync: async () => {} } })).toEqual({ ok: false, code: "invalid" });
    const r = await answerConfirm(db, { shop: SHOP, token: T, form: { answer: "agree", lineIds: ["l2"], note: "" }, deps: { write: async () => ({ ok: false, message: "x" }), sync: async () => {} } });
    expect(r.code).toBe("save_failed");
    expect(db.bookings[1].confirmedAt).toBeNull();
    expect(db.history).toEqual([]);
  });
});

describe("writeOutcome", () => {
  const state = { schemaVersion: 2, lines: {}, history: [], delivery: { l1: { outcome: "declined", at: "x", by: {} } } };
  const actor = { id: null, name: "Tester", source: "self-declared" };
  const deps = (commit) => ({ load: async () => ({ state, digest: "d" }), commit, now: () => "2026-11-27T10:00:00Z", newId: () => "e1" });

  it("sets an answer with a history entry", async () => {
    const commit = vi.fn(async () => ({ ok: true }));
    expect(await writeOutcome({ orderId: "o1", lineIds: ["l2"], outcome: "confirmed", actor, deps: deps(commit) })).toEqual({ ok: true, changed: true });
    const next = commit.mock.calls[0][2];
    expect(next.delivery.l2.outcome).toBe("confirmed");
    expect(next.history.at(-1)).toMatchObject({ scope: "delivery", values: [{ target: "l2", from: null, to: "confirmed" }] });
  });

  it("clears an answer, and does nothing when there is none", async () => {
    const commit = vi.fn(async () => ({ ok: true }));
    await writeOutcome({ orderId: "o1", lineIds: ["l1", "l9"], outcome: null, actor, deps: deps(commit) });
    const next = commit.mock.calls[0][2];
    expect(next.delivery.l1).toBeUndefined();
    expect(next.history.at(-1).values).toEqual([{ target: "l1", from: "declined", to: null }]);
    expect(await writeOutcome({ orderId: "o1", lineIds: ["l9"], outcome: null, actor, deps: deps(commit) })).toEqual({ ok: true, changed: false });
  });

  it("tries again once when someone else saved the order at the same time", async () => {
    const commit = vi.fn().mockResolvedValueOnce({ ok: false, reason: "stale" }).mockResolvedValueOnce({ ok: true });
    expect(await writeOutcome({ orderId: "o1", lineIds: ["l2"], outcome: "confirmed", actor, deps: deps(commit) })).toEqual({ ok: true, changed: true });
    expect(commit).toHaveBeenCalledTimes(2);
  });
});

describe("rescheduleToDate", () => {
  const actor = { id: "1", name: "Staff" };
  it("moves booked lines, books carrier lines that had none, clears the old answer and emails once per order", async () => {
    const db = fakeDb({
      bookings: [booking("l1", { confirmedAt: new Date(), confirmNote: "old" })],
      lines: [line("l1"), line("l2"), line("l3", { orderId: "o2" })],
    });
    const write = vi.fn(async () => ({ ok: true, changed: true }));
    const queueEmail = vi.fn(async () => ({ ok: true }));
    const r = await rescheduleToDate(db, { shop: SHOP, request: { lineIds: ["l1", "l2", "l3"], date: "2026-12-29", page: "tnt", email: true }, actor, queueEmail, deps: { write, sync: async () => {} } });
    expect(r).toMatchObject({ ok: true, lines: 3, orders: 2, emailed: 2, skipped: 0, clearFailed: 0 });
    expect(db.bookings.map((b) => [b.lineId, b.date, b.partner, b.confirmToken, b.confirmNote])).toEqual([
      ["l1", "2026-12-29", "TNT", null, null],
      ["l2", "2026-12-29", "TNT", null, null],
      ["l3", "2026-12-29", "TNT", null, null],
    ]);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", lineIds: ["l1", "l2"], outcome: null }));
    expect(db.history[0]).toMatchObject({ action: "rescheduled", reason: "Moved from 30/11/2026 to 29/12/2026" });
    expect(db.bookings.every((b) => b.emailed)).toBe(true);
  });

  it("on Delivery Booked, a line with no booking is left out; no email when not asked", async () => {
    const db = fakeDb({ bookings: [booking("l1", { partner: "CFS", vanId: "v1", drop: 3 })], lines: [line("l1"), line("l2")] });
    const queueEmail = vi.fn();
    const r = await rescheduleToDate(db, { shop: SHOP, request: { lineIds: ["l1", "l2"], date: "2026-12-29", page: "booked", email: false }, actor, queueEmail, deps: { write: async () => ({ ok: true, changed: false }), sync: async () => {} } });
    expect(r).toMatchObject({ ok: true, lines: 1, skipped: 1, emailed: 0 });
    expect(db.bookings[0]).toMatchObject({ date: "2026-12-29", vanId: "v1", drop: 3 });
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it("refuses a bad date", async () => {
    expect(await rescheduleToDate(fakeDb(), { shop: SHOP, request: { lineIds: ["l1"], date: "29/12/2026" }, actor })).toEqual({ ok: false, code: "bad_date" });
  });
});

describe("sendNotConfirmed", () => {
  it("emails each order once and logs it; nothing else changes", async () => {
    const db = fakeDb({ bookings: [booking("l1"), booking("l2")], lines: [line("l1"), line("l2"), line("l3", { orderId: "o2" })] });
    const before = JSON.stringify(db.bookings);
    const queueEmail = vi.fn(async ({ orderId }) => (orderId === "o2" ? { ok: false, code: "no_order" } : { ok: true }));
    const r = await sendNotConfirmed(db, { shop: SHOP, lineIds: ["l1", "l2", "l3"], actor: { name: "Staff" }, queueEmail });
    expect(r).toEqual({ ok: true, orders: 2, emailed: 1, emailFailed: 1, emailCode: "no_order" });
    expect(db.history.map((h) => [h.lineId, h.action])).toEqual([["l1", "not_confirmed_emailed"], ["l2", "not_confirmed_emailed"]]);
    expect(JSON.stringify(db.bookings)).toBe(before);
  });
});

describe("readFollowUp", () => {
  it("reads both actions", () => {
    expect(readFollowUp({ action: "not_confirmed", lineIds: ["a", "a", "b"] })).toEqual({ value: { action: "not_confirmed", lineIds: ["a", "b"] } });
    expect(readFollowUp({ action: "reschedule", lineIds: ["a"], date: "2026-12-29", page: "tnt" })).toEqual({ value: { action: "reschedule", lineIds: ["a"], date: "2026-12-29", page: "tnt", email: true } });
    expect(readFollowUp({ action: "reschedule", lineIds: ["a"], date: "2026-12-29", page: "x", email: false }).value).toMatchObject({ page: "booked", email: false });
  });
  it("refuses what it cannot use", () => {
    expect(readFollowUp({ action: "reschedule", lineIds: [] })).toEqual({ error: "no_lines" });
    expect(readFollowUp({ action: "reschedule", lineIds: ["a"], date: "bad" })).toEqual({ error: "bad_date" });
    expect(readFollowUp({ action: "delete", lineIds: ["a"] })).toEqual({ error: "bad_request" });
  });
});

describe("confirm page", () => {
  const site = { deliveriesEmail: "deliveries@cfsonline.co.uk", phone: "0116-296-3800" };
  it("escapes everything, including Liquid braces", () => {
    expect(esc("{{ shop.name }} {% x %} <b>")).toBe("&#123;&#123; shop.name &#125;&#125; &#123;&#37; x &#37;&#125; &lt;b&gt;");
    const html = confirmPage({ data: { state: "open", order: { name: "#1", firstName: "{{x}}" }, open: [{ lineId: "l1", title: "Sofa", options: "", quantity: 1, date: "30/11/2026", dateLong: "Monday 30 November 2026", slot: "AM" }], answered: [] }, token: T, site, formAction: "/apps/cfs-delivery/delivery-confirm" });
    expect(html).not.toContain("{{");
    expect(html).toContain('value="agree"');
    expect(html).toContain('value="disagree"');
    expect(html).toContain('<form method="post" action="/apps/cfs-delivery/delivery-confirm">');
    expect(html).toContain("Monday 30 November 2026");
  });
  it("shows the right message for an old link and after each answer", () => {
    expect(confirmPage({ data: { state: "invalid" }, token: "", site, formAction: "/" })).toContain("This link is no longer valid");
    expect(answeredPage({ order: { name: "#1" }, answer: "confirmed", site })).toContain("your delivery is confirmed");
    expect(answeredPage({ order: { name: "#1" }, answer: "declined", site, emailed: true })).toContain("We have also sent you an email");
  });
  it("formats long dates", () => {
    expect(longDate("2026-12-29")).toBe("Tuesday 29 December 2026");
    expect(longDate(null)).toBe("");
  });
});

describe("email wording", () => {
  it("the booking email has the confirm button, and shops with the old text get it", () => {
    expect(OTHER_TEMPLATES.find((t) => t.key === "delivery.booking_confirmation").body).toBe(BOOKING_CONFIRMATION_BODY);
    expect(UPGRADES[0]).toMatchObject({ key: "delivery.booking_confirmation", to: BOOKING_CONFIRMATION_BODY });
    expect(UPGRADES[0].from[0]).not.toContain("CLICK HERE TO CONFIRM");
    expect(UPGRADES[0].from[1]).toContain("background:#c00");
    expect(BOOKING_CONFIRMATION_BODY).toContain("background:#4D403A;color:#fff");
    expect(UPGRADES[1].to).toContain("background:#4D403A;color:#fff");
  });
});
