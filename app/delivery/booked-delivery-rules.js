// Rules for the Delivery Booked page (legacy "Delivery Booking History") and for keeping drop numbers in order. No database access here.
import { MAX_DROP } from "./bulk-delivery-rules.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const validDate = (v) => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const lineIdsOf = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && x))] : []);

/** Reads the list's query string: ?from=&to=&brand=&q= . With no dates it shows today. */
export function parseBookedParams(searchParams, today) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const a = validDate(from) ? from : validDate(to) ? to : today;
  const b = validDate(to) ? to : a;
  const brand = searchParams.get("brand")?.trim();
  return { from: a <= b ? a : b, to: a <= b ? b : a, brand: brand ? brand.slice(0, 200) : null, q: (searchParams.get("q") ?? "").slice(0, 2000) };
}

/**
 * Gives some orders a drop and moves the others out of the way.
 * current: Map orderId -> drop for the van and day; pinned: Map orderId -> the drop they must have.
 * An order that is not pinned keeps its drop unless a pinned order wants it; then it (and any order after it that is now in the way)
 * moves down to the next free number. Returns { ok: true, drops: Map } or { ok: false, code }.
 */
export function placeDrops(current, pinned) {
  for (const d of pinned.values()) if (!Number.isInteger(d) || d < 1) return { ok: false, code: "bad_drop" };
  const taken = new Set(pinned.values());
  const drops = new Map(pinned);
  const rest = [...current].filter(([id]) => !pinned.has(id)).sort((x, y) => (x[1] ?? 0) - (y[1] ?? 0));
  for (const [id, drop] of rest) {
    if (drop === null || drop === undefined) { drops.set(id, null); continue; }
    let next = drop;
    while (taken.has(next)) next += 1;
    taken.add(next);
    drops.set(id, next);
  }
  for (const d of drops.values()) if (d !== null && d > MAX_DROP) return { ok: false, code: "drop_limit" };
  return { ok: true, drops };
}

/** Reads a POST body: { action: "drops", date, vanId, rows: [{ lineId, drop }] } or { action: "reschedule", lineIds, reason }. */
export function readBookedRequest(body) {
  if (!isObject(body)) return { error: "bad_request" };
  if (body.action === "reschedule") {
    const lineIds = lineIdsOf(body.lineIds);
    if (lineIds.length === 0 || lineIds.length > 500) return { error: "bad_request" };
    return { value: { action: "reschedule", lineIds, reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "" } };
  }
  if (body.action === "drops") {
    if (!validDate(body.date) || typeof body.vanId !== "string" || !body.vanId) return { error: "bad_request" };
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 500) return { error: "bad_request" };
    const rows = [];
    for (const r of body.rows) {
      if (!isObject(r) || typeof r.lineId !== "string" || !r.lineId || !Number.isInteger(r.drop)) return { error: "bad_request" };
      if (r.drop < 1 || r.drop > MAX_DROP) return { error: "drop_limit" };
      rows.push({ lineId: r.lineId, drop: r.drop });
    }
    return { value: { action: "drops", date: body.date, vanId: body.vanId, rows } };
  }
  return { error: "bad_request" };
}
