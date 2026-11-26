// Rules for the delivery fleet lists and delivery bookings. Pure functions, no database.

export const MAX_DROPS = 16; // a van takes at most 16 drops a day
export const MAX_LINES = 200;
export const PARTNERS = ["CFS", "TNT", "Pallet", "Graham Scotland", "Graham Devon", "Fur Deco"]; // only CFS has van, driver and drop
export const SLOTS = { ALL: "All Day", AM: "AM", PM: "PM" };
export const FLEET_KINDS = ["driver", "van", "slot"];
// Order statuses that count as "live" when checking whether a drop is already taken (the legacy list).
export const LIVE_STATUSES = [4, 14, 31, 33, 40, 43, 44, 45, 46, 47, 48, 49, 5];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => (typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);

export function validDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Reads a change to the fleet lists. Returns { value } or { error }. op: add | rename | deactivate | restore. */
export function readFleetInput(body) {
  if (!isObject(body)) return { error: "bad_request" };
  const { kind, op } = body;
  if (!FLEET_KINDS.includes(kind) || !["add", "rename", "deactivate", "restore"].includes(op)) return { error: "bad_request" };
  if (op === "add" || op === "rename") {
    const name = text(body.name, 100);
    if (!name) return { error: "bad_request" };
    const extra = typeof body.extra === "string" ? body.extra.trim().slice(0, 100) : "";
    if (op === "rename" && typeof body.id !== "string") return { error: "bad_request" };
    const optId = (v) => (typeof v === "string" && v ? v : null);
    return { value: { kind, op, id: body.id, name, extra, ...(kind === "van" ? { driverId: optId(body.driverId), coDriverId: optId(body.coDriverId) } : {}) } };
  }
  if (typeof body.id !== "string" || !body.id) return { error: "bad_request" };
  return { value: { kind, op, id: body.id } };
}

/** Reads a change to several vans or drivers at once: { kind, action: activate | deactivate | delete, ids }. */
export function readBulkFleet(body) {
  if (!isObject(body)) return { error: "bad_request" };
  const { kind, action } = body;
  if (!["driver", "van"].includes(kind) || !["activate", "deactivate", "delete"].includes(action)) return { error: "bad_request" };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x) => typeof x === "string" && x))] : [];
  if (ids.length === 0 || ids.length > 200) return { error: "bad_request" };
  return { value: { kind, action, ids } };
}

/** Reads a booking request. action: check | book | reschedule. Returns { value } or { error }. */
export function readBookingRequest(body) {
  if (!isObject(body)) return { error: "bad_request" };
  const { action } = body;
  if (!["check", "book", "reschedule"].includes(action)) return { error: "bad_request" };
  const lineIds = Array.isArray(body.lineIds) ? [...new Set(body.lineIds.filter((x) => typeof x === "string" && x))] : [];
  if (lineIds.length === 0 || lineIds.length > MAX_LINES) return { error: "bad_request" };

  if (action === "reschedule") {
    const reason = text(body.reason, 500);
    if (!reason) return { error: "reason_required" };
    if (typeof body.attempted !== "boolean") return { error: "attempted_required" };
    // The reschedule charge is only what the customer agreed to: one amount for the whole reschedule, VAT included; blank = no charge.
    const raw = body.attempted && (typeof body.charge === "string" || typeof body.charge === "number") ? String(body.charge).replace(/[£,\s]/g, "") : "";
    if (raw !== "" && !/^\d{1,6}(\.\d{1,2})?$/.test(raw)) return { error: "bad_charge" };
    const chargeMinor = raw === "" ? 0 : Math.round(Number(raw) * 100);
    return { value: { action, lineIds, reason, emailCustomer: body.emailCustomer !== false, attempted: body.attempted, chargeMinor } };
  }

  if (!validDate(body.date)) return { error: "bad_date" };
  const drop = body.drop === undefined || body.drop === null || body.drop === "" ? null : Number(body.drop);
  if (drop !== null && (!Number.isInteger(drop) || drop < 1 || drop > MAX_DROPS)) return { error: "bad_drop" };
  const partner = body.partner === undefined || body.partner === null || body.partner === "" ? "CFS" : body.partner;
  if (!PARTNERS.includes(partner)) return { error: "bad_partner" };
  let amPm = body.amPm === undefined || body.amPm === null || body.amPm === "" ? null : body.amPm;
  if (amPm !== null && !Object.hasOwn(SLOTS, amPm)) return { error: "bad_am_pm" };
  const id = (v) => (typeof v === "string" && v ? v : null);
  // A carrier only gets a date: no van, driver, drop or slot.
  const own = partner === "CFS";
  const vanId = own ? id(body.vanId) : null;
  if (own && drop !== null && !vanId) return { error: "drop_needs_van" };
  if (!own) amPm = null;
  return { value: { action, lineIds, partner, date: body.date, vanId, driverId: own ? id(body.driverId) : null, slotId: null, drop: own ? drop : null, amPm, allowDuplicate: body.allowDuplicate === true, emailCustomer: body.emailCustomer === true } };
}

/** PM on a drop makes every later drop on the same van and day PM. Returns the bookings that must change to PM. */
export function pmFollowers(bookings, vanId, date, drop, amPm) {
  if (amPm !== "PM" || !vanId || drop === null) return [];
  return bookings.filter((b) => b.vanId === vanId && b.date === date && b.drop !== null && b.drop > drop && b.amPm !== "PM");
}
