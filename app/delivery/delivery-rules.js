// Rules for the delivery fleet lists and delivery bookings. Pure functions, no database.

export const MAX_DROPS = 16; // a van takes at most 16 drops a day
export const MAX_LINES = 200;
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
    return { value: { kind, op, id: body.id, name, extra } };
  }
  if (typeof body.id !== "string" || !body.id) return { error: "bad_request" };
  return { value: { kind, op, id: body.id } };
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
    return { value: { action, lineIds, reason, emailCustomer: body.emailCustomer !== false } };
  }

  if (!validDate(body.date)) return { error: "bad_date" };
  const drop = body.drop === undefined || body.drop === null || body.drop === "" ? null : Number(body.drop);
  if (drop !== null && (!Number.isInteger(drop) || drop < 1 || drop > MAX_DROPS)) return { error: "bad_drop" };
  const amPm = body.amPm === undefined || body.amPm === null || body.amPm === "" ? null : body.amPm;
  if (amPm !== null && amPm !== "AM" && amPm !== "PM") return { error: "bad_am_pm" };
  const id = (v) => (typeof v === "string" && v ? v : null);
  const vanId = id(body.vanId);
  if (drop !== null && !vanId) return { error: "drop_needs_van" };
  return { value: { action, lineIds, date: body.date, vanId, driverId: id(body.driverId), slotId: id(body.slotId), drop, amPm, allowDuplicate: body.allowDuplicate === true } };
}

/** PM on a drop makes every later drop on the same van and day PM. Returns the bookings that must change to PM. */
export function pmFollowers(bookings, vanId, date, drop, amPm) {
  if (amPm !== "PM" || !vanId || drop === null) return [];
  return bookings.filter((b) => b.vanId === vanId && b.date === date && b.drop !== null && b.drop > drop && b.amPm !== "PM");
}
