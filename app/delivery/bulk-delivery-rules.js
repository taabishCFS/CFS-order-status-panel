// Rules for the bulk Book Delivery pages (the legacy "Book Delivery" list and "Delivery Booking" page). No database access here.

/** Lines in these statuses can be booked for delivery (legacy: stock, coming in, collection, exchange, allocated ...). */
export const BOOKABLE_STATUSES = [4, 14, 31, 33, 43, 44, 45, 46, 47, 48, 49, 69, 55, 61, 75];
/** An order is only listed when every line is bookable or one of these (completed, cancelled, deleted, failed, awaiting approval or payment). */
export const IGNORED_STATUSES = [6, 7, 9, 32, 58, 50];
/** The Mark buttons: which carrier each one gives the ticked lines. */
export const MARKS = { TNT: "TNT", PALLET: "Pallet", FURDECO: "Fur Deco" };
export const PAGE_SIZE = 100;
export const MAX_LINES = 500;
export const MAX_DROP = 16;
/** Delivery type shown on a row, first match wins (the order the legacy list checks them). */
export const TYPE_ORDER = [
  ["peace_of_mind", "Peace Of Mind"],
  ["white_glove", "White Glove Delivery"],
  ["two_man", "Two Man Delivery"],
  ["scotland", "Scotland Delivery"],
  ["ireland", "Ireland Delivery"],
  ["postcode_pa_iv_kw", "Postcode Delivery"],
];
export const DEFAULT_TYPE = "Free Door Delivery";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const lineIdsOf = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && x))] : []);

/** What to show in the Delivery Type column, from the titles of the order's lines (service lines carry a [svc:key] marker). */
export function deliveryTypeOf(titles) {
  const keys = new Set(titles.map((t) => /\[svc:([a-z_]+)\]/.exec(t ?? "")?.[1]).filter(Boolean));
  return TYPE_ORDER.find(([key]) => keys.has(key))?.[1] ?? DEFAULT_TYPE;
}

/** Search text such as "UD3163, CF43 4LT" as a list of non-empty parts. */
export function splitKeywords(q) {
  return typeof q === "string" ? q.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500) : [];
}

/** Reads the query string of the list: ?q=&brand=&page=. */
export function parseBulkParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const brand = searchParams.get("brand")?.trim();
  return {
    q: (searchParams.get("q") ?? "").slice(0, 20000),
    brand: brand ? brand.slice(0, 200) : null,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** Does an order match the search (legacy: order number or postcode contains the text)? Returns the keyword's position, or -1. */
export function keywordIndex(keywords, order) {
  const name = (order.name ?? "").toLowerCase().replace(/^#/, "");
  const zip = (order.postcode ?? "").toLowerCase();
  return keywords.findIndex((k) => {
    const x = k.toLowerCase().replace(/^#/, "");
    return name.includes(x) || zip.includes(x);
  });
}

/** Reads a POST body: { action: "mark" | "load" | "book" | "reschedule", ... }. Returns { value } or { error }. */
export function readBulkRequest(body) {
  if (!isObject(body)) return { error: "bad_request" };
  const { action } = body;
  const lineIds = lineIdsOf(body.lineIds);
  if (action === "mark") {
    if (!Object.hasOwn(MARKS, body.mark) || lineIds.length === 0 || lineIds.length > MAX_LINES) return { error: "bad_request" };
    return { value: { action, mark: body.mark, lineIds } };
  }
  if (action === "load" || action === "reschedule") {
    if (lineIds.length === 0 || lineIds.length > MAX_LINES) return { error: "bad_request" };
    return { value: { action, lineIds, reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "" } };
  }
  if (action === "book") {
    if (!(typeof body.date === "string" && DATE.test(body.date)) || Number.isNaN(Date.parse(`${body.date}T00:00:00Z`))) return { error: "bad_date" };
    const van = body.vanId === "prebook" ? "prebook" : typeof body.vanId === "string" && body.vanId ? body.vanId : null;
    if (!van) return { error: "van_required" };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0 || rows.length > MAX_LINES) return { error: "bad_request" };
    const out = [];
    for (const r of rows) {
      if (!isObject(r) || typeof r.lineId !== "string" || !r.lineId) return { error: "bad_request" };
      const drop = Number(r.drop);
      if (!Number.isInteger(drop) || drop < 1 || drop > MAX_DROP) return { error: "drop_required" };
      if (r.amPm !== "AM" && r.amPm !== "PM") return { error: "slot_required" };
      out.push({ lineId: r.lineId, drop, amPm: r.amPm });
    }
    if (new Set(out.map((r) => r.lineId)).size !== out.length) return { error: "bad_request" };
    return { value: { action, date: body.date, vanId: van, rows: out, allowDuplicate: body.allowDuplicate === true, emailCustomers: body.emailCustomers !== false } };
  }
  return { error: "bad_request" };
}
