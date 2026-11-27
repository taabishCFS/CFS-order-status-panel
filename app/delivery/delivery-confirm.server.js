// The customer's "confirm your delivery" link (legacy ordersconfrm.php + confrom_order.php), and the staff follow-ups on the delivery pages:
// reschedule ticked lines to one new date (and email them a fresh confirm link), and the "we did not get your confirmation" email.
// The customer's answer is saved where staff answers go: the order's status record (Confirmed / Declined), with the order's copy refreshed.
import { randomBytes } from "node:crypto";
import { applyDelivery } from "../../extensions/cfs-order-status/src/detailState";
import { archiveEntries } from "../../extensions/cfs-order-status/src/archive";
import { commitChange } from "../../extensions/cfs-order-status/src/save";
import { loadState, saveState } from "../../extensions/cfs-order-status/src/store";
import { fetchOrder } from "../orders/fetch-order.server";
import { mapOrder } from "../orders/map-order";
import { upsertOrder } from "../orders/mirror.server";
import { listFleet } from "./delivery.server.js";

export const TOKEN = /^[a-f0-9]{48}$/;
export const CUSTOMER = { id: null, name: "By Customer", source: "self-declared" };
export const NOTE_MAX = 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANSWERS = { agree: "confirmed", disagree: "declined" };
// The carrier each delivery page's lines go by, for a line that has no booking yet (DHD lines are listed by status, not by a mark).
export const PAGE_PARTNER = { tnt: "TNT", pallet: "Pallet", furdeco: "Fur Deco", dhd: "DHD" };

export const newConfirmToken = () => randomBytes(24).toString("hex");
// The store-website path of the confirm page (app proxy prefix + subpath). Set DELIVERY_CONFIRM_PATH if a store's proxy path was changed in its admin.
export const CONFIRM_PATH = "/apps/cfs-delivery/delivery-confirm";
/** The link in the email: the shop's own website (app proxy), so the customer stays on the store and its theme. */
export const confirmLink = (shop, token, path = process.env.DELIVERY_CONFIRM_PATH || CONFIRM_PATH) => `https://${shop}${path}?t=${token}`;
export const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** 2026-11-30 -> "Monday 30 November 2026". */
export const longDate = (iso) => {
  if (!DATE.test(String(iso ?? "").slice(0, 10))) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const slotText = (amPm) => (amPm === "ALL" ? "All Day" : amPm === "AM" || amPm === "PM" ? amPm : "");

/** Puts a new confirm token on the lines (a newer email makes the older link stop working) and returns the link. */
export async function issueConfirmLink(db, { shop, lineIds, newToken = newConfirmToken }) {
  const token = newToken();
  await db.deliveryBooking.updateMany({ where: { shop, lineId: { in: lineIds } }, data: { confirmToken: token, confirmedAt: null, confirmNote: null } });
  return confirmLink(shop, token);
}

const viaGraphql = (graphql) => async (_url, init) => {
  const { query, variables } = JSON.parse(init.body);
  return graphql(query, { variables });
};

/**
 * Sets (outcome "confirmed" | "declined") or clears (null) the delivery answer on lines of one order, in the order's status record,
 * the same record and history the order page writes. Tries twice if someone saved the order at the same moment.
 * Returns { ok: true, changed } or { ok: false, message }.
 */
export async function writeOutcome({ graphql, orderId, lineIds, outcome, actor, deps = {} }) {
  const fetchFn = graphql ? viaGraphql(graphql) : null;
  const load = deps.load ?? ((id) => loadState(id, fetchFn));
  const commit =
    deps.commit ??
    ((id, current, next, digest) =>
      commitChange(id, current, next, digest, { archive: (oid, entries) => archiveEntries(oid, entries, fetchFn), save: (oid, state, d) => saveState(oid, state, d, fetchFn) }));
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const loaded = await load(orderId);
    const state = loaded.state;
    const meta = { actor, now: now(), entryId: newId() };
    let next;
    if (outcome) next = applyDelivery(state, { lineIds, outcome, ...meta });
    else {
      const had = lineIds.filter((id) => state.delivery?.[id]?.outcome);
      if (had.length === 0) return { ok: true, changed: false };
      const delivery = { ...state.delivery };
      for (const id of had) delete delivery[id];
      const values = had.map((id) => ({ target: id, from: state.delivery[id].outcome, to: null }));
      next = { ...state, schemaVersion: 2, delivery, history: [...(state.history ?? []), { id: meta.entryId, at: meta.now, by: actor, scope: "delivery", changes: [], values }] };
    }
    const saved = await commit(orderId, state, next, loaded.digest);
    if (saved.ok) return { ok: true, changed: true };
    if (saved.reason !== "stale") return { ok: false, message: saved.message ?? "the order could not be saved" };
  }
  return { ok: false, message: "the order was being changed by someone else" };
}

const syncOrder = (db, shop, graphql) => async (orderId) => upsertOrder(db, mapOrder(shop, await fetchOrder(graphql, orderId)));

/**
 * What the customer's confirm page shows for a link.
 * { state: "invalid" } for a link that is wrong or was replaced by a newer email; otherwise
 * { state: "open", order: { name, firstName }, open: [items still to answer], answered: [items already answered] }.
 */
export async function loadConfirmPage(db, { shop, token }) {
  if (!TOKEN.test(token ?? "")) return { state: "invalid" };
  const bookings = await db.deliveryBooking.findMany({ where: { shop, confirmToken: token } });
  if (bookings.length === 0) return { state: "invalid" };
  const orderId = bookings[0].orderId;
  const [order, lines] = await Promise.all([
    db.order.findUnique({ where: { shop_orderId: { shop, orderId } } }),
    db.orderLine.findMany({ where: { shop, lineId: { in: bookings.map((b) => b.lineId) } } }),
  ]);
  if (!order || order.cancelledAt) return { state: "invalid" };
  const lineOf = new Map(lines.map((l) => [l.lineId, l]));
  const items = bookings
    .filter((b) => (lineOf.get(b.lineId)?.quantity ?? 0) > 0)
    .map((b) => {
      const l = lineOf.get(b.lineId);
      const options = l.variantTitle && l.variantTitle !== "Default Title" ? l.variantTitle : "";
      return { lineId: b.lineId, title: l.title, options, quantity: l.quantity, date: dmy(b.date), dateLong: longDate(b.date), slot: slotText(b.amPm), answer: b.confirmedAt ? l.deliveryOutcome ?? null : null, answeredAt: b.confirmedAt };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  if (items.length === 0) return { state: "invalid" };
  const firstName = String(order.customerName ?? "").trim().split(/\s+/)[0] || "Customer";
  return { state: "open", order: { name: order.name, firstName }, open: items.filter((i) => !i.answeredAt), answered: items.filter((i) => i.answeredAt) };
}

/** Reads the posted form: { lineIds, answer: "agree" | "disagree", note }. */
export function readConfirmForm(form) {
  const answer = String(form.get("answer") ?? "");
  if (!Object.hasOwn(ANSWERS, answer)) return { error: "answer" };
  const lineIds = form.getAll("line").map(String).filter(Boolean).slice(0, 200);
  if (lineIds.length === 0) return { error: "no_lines" };
  return { value: { answer, lineIds, note: String(form.get("note") ?? "").trim().slice(0, NOTE_MAX) } };
}

/**
 * The customer answers (Agree / Disagree) for the ticked items of their link. Saves Confirmed or Declined on the order (By Customer), keeps their
 * note, logs it in the delivery history and, on Disagree, queues the legacy "delivery taken off the schedule" email.
 * Returns { ok: true, answer, emailed } or { ok: false, code: "invalid" | "save_failed" }.
 * deps (tests): { write, sync, queue, now }.
 */
export async function answerConfirm(db, { shop, token, form, graphql, deps = {} }) {
  if (!TOKEN.test(token ?? "")) return { ok: false, code: "invalid" };
  const bookings = await db.deliveryBooking.findMany({ where: { shop, confirmToken: token, confirmedAt: null, lineId: { in: form.lineIds } } });
  if (bookings.length === 0) return { ok: false, code: "invalid" };
  const orderId = bookings[0].orderId;
  const lineIds = bookings.filter((b) => b.orderId === orderId).map((b) => b.lineId);
  const outcome = ANSWERS[form.answer];
  const write = deps.write ?? ((args) => writeOutcome({ ...args, graphql }));
  const saved = await write({ orderId, lineIds, outcome, actor: CUSTOMER });
  if (!saved.ok) return { ok: false, code: "save_failed", message: saved.message };
  const at = (deps.now ?? (() => new Date()))();
  await db.deliveryBooking.updateMany({ where: { shop, lineId: { in: lineIds } }, data: { confirmedAt: at, confirmNote: form.note || null } });
  for (const b of bookings) {
    await db.deliveryHistory.create({
      data: { shop, orderId, lineId: b.lineId, action: outcome === "confirmed" ? "customer_confirmed" : "customer_declined", partner: b.partner, date: b.date, amPm: b.amPm, reason: form.note || null, actorName: CUSTOMER.name },
    });
  }
  try {
    await (deps.sync ?? syncOrder(db, shop, graphql))(orderId);
  } catch (e) {
    console.error(`Order copy refresh after delivery answer ${orderId} failed`, e?.message ?? e);
  }
  let emailed = false;
  if (outcome === "declined" && deps.queue) {
    const sent = await deps.queue({ orderId, lineIds });
    emailed = Boolean(sent?.ok);
  }
  return { ok: true, answer: outcome, emailed };
}

/**
 * Staff: move the ticked lines to one new delivery date (Bulk Reschedule on the delivery pages). Lines without a booking on a carrier page get one
 * for that carrier. Van, driver, drop and AM/PM stay as they were. The old answer is cleared (the new date needs a new one) and, when asked,
 * each customer gets the new-date email with a fresh confirm link (one email per order).
 * request: { lineIds, date, page, email }.  queueEmail({ orderId, lineIds, date, lines }) -> { ok } | { ok:false, code }.
 * Returns { ok: true, lines, orders, emailed, emailFailed, skipped, clearFailed } or { ok: false, code }.
 */
export async function rescheduleToDate(db, { shop, request, actor, graphql, queueEmail, deps = {} }) {
  if (!DATE.test(request.date ?? "")) return { ok: false, code: "bad_date" };
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: request.lineIds } }, select: { lineId: true, orderId: true } });
  if (lines.length === 0) return { ok: false, code: "no_lines" };
  const existing = new Map((await db.deliveryBooking.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) } } })).map((b) => [b.lineId, b]));
  const partner = PAGE_PARTNER[request.page] ?? null;
  const fleet = await listFleet(db, shop);
  const vanName = new Map(fleet.vans.map((v) => [v.id, v.name]));
  const driverName = new Map(fleet.drivers.map((d) => [d.id, d.name]));
  const moved = [];
  let skipped = 0;
  for (const l of lines) {
    const b = existing.get(l.lineId);
    if (!b && !partner) {
      skipped += 1;
      continue;
    }
    const oldDate = b?.date ?? null;
    const data = { date: request.date, prebook: false, emailed: false, confirmToken: null, confirmedAt: null, confirmNote: null, bookedByName: actor.name };
    const row = b
      ? await db.deliveryBooking.update({ where: { id: b.id }, data })
      : await db.deliveryBooking.create({ data: { shop, lineId: l.lineId, orderId: l.orderId, partner, ...data } });
    await db.deliveryHistory.create({
      data: {
        shop, orderId: l.orderId, lineId: l.lineId, action: "rescheduled", partner: row.partner, date: request.date,
        vanName: row.vanId ? vanName.get(row.vanId) ?? null : null, driverName: row.driverId ? driverName.get(row.driverId) ?? null : null,
        drop: row.drop, amPm: row.amPm, reason: oldDate ? `Moved from ${dmy(oldDate)} to ${dmy(request.date)}` : `Delivery date set to ${dmy(request.date)}`, actorName: actor.name,
      },
    });
    moved.push(row);
  }
  if (moved.length === 0) return { ok: false, code: "not_booked" };

  const byOrder = new Map();
  for (const r of moved) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]);
  const write = deps.write ?? ((args) => writeOutcome({ ...args, graphql }));
  const sync = deps.sync ?? syncOrder(db, shop, graphql);
  let clearFailed = 0;
  let emailed = 0;
  const failed = [];
  for (const [orderId, rows] of byOrder) {
    const lineIds = rows.map((r) => r.lineId);
    try {
      const cleared = await write({ orderId, lineIds, outcome: null, actor });
      if (!cleared.ok) clearFailed += 1;
      else if (cleared.changed) await sync(orderId);
    } catch (e) {
      clearFailed += 1;
      console.error(`Clearing the delivery answer on ${orderId} failed`, e?.message ?? e);
    }
    if (!request.email) continue;
    const sent = await queueEmail({ orderId, lineIds, date: request.date, lines: rows });
    if (sent.ok) {
      emailed += 1;
      await db.deliveryBooking.updateMany({ where: { shop, lineId: { in: lineIds } }, data: { emailed: true } });
    } else failed.push(sent.code);
  }
  return { ok: true, lines: moved.length, orders: byOrder.size, emailed, emailFailed: failed.length, emailCode: failed[0] ?? null, skipped, clearFailed };
}

/**
 * Staff: email the ticked lines' customers that we did not get their delivery confirmation and will arrange another delivery in 24-72 hours.
 * Only sends the email (one per order) and logs it; nothing else changes. queueEmail({ orderId, lineIds, lines }) -> { ok } | { ok:false, code }.
 */
export async function sendNotConfirmed(db, { shop, lineIds, actor, queueEmail }) {
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds } }, select: { lineId: true, orderId: true } });
  if (lines.length === 0) return { ok: false, code: "no_lines" };
  const bookings = new Map((await db.deliveryBooking.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) } } })).map((b) => [b.lineId, b]));
  const byOrder = new Map();
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l.lineId]);
  let emailed = 0;
  const failed = [];
  for (const [orderId, ids] of byOrder) {
    const sent = await queueEmail({ orderId, lineIds: ids, lines: ids.map((id) => bookings.get(id)).filter(Boolean) });
    if (!sent.ok) {
      failed.push(sent.code);
      continue;
    }
    emailed += 1;
    for (const id of ids) {
      const b = bookings.get(id);
      await db.deliveryHistory.create({ data: { shop, orderId, lineId: id, action: "not_confirmed_emailed", partner: b?.partner ?? "CFS", date: b?.date ?? null, amPm: b?.amPm ?? null, actorName: actor.name } });
    }
  }
  return { ok: true, orders: byOrder.size, emailed, emailFailed: failed.length, emailCode: failed[0] ?? null };
}
