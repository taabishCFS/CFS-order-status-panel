// Pure rules for ordering from and chasing suppliers: Process Order, Supplier Chaseup and Date Lapsed. No database access here.

export const ORDER_IN_PROGRESS = 3;
/** Supplier Chaseup lists lines in these statuses (legacy: Order in Progress, Delayed, Service Issue, Part Order Delivered). */
export const CHASE_STATUSES = [3, 10, 15, 16];
/** Date Lapsed lists lines in these statuses (legacy: Order in Progress, Delayed, Invoice Paid, Due In Stock, Service Issue). */
export const LAPSED_STATUSES = [3, 10, 13, 57, 15];
/** Lines in these statuses are never ordered: Container Stock and Policy Purchased (legacy 40, 81), plus the statuses hidden from lists. */
export const NOT_ORDERABLE_STATUSES = [40, 81, 6, 7, 9, 32, 58, 66, 50];
export const KINDS = ["chaseup", "lapsed"];
export const PAGE_SIZE = 50;
export const MAX_ALL = 5000;
export const MAX_PROCESS_LINES = 500;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v) => (v && DATE.test(v) && new Date(`${v}T00:00:00.000Z`).toISOString().startsWith(v) ? v : null);

/** Today's date in the UK as YYYY-MM-DD. */
export function ukToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A YYYY-MM-DD date moved by some days. */
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Reads the query string of the chase pages. */
export function parseChaseParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const kind = searchParams.get("kind");
  const brand = searchParams.get("brand")?.trim();
  return {
    kind: KINDS.includes(kind) ? kind : "chaseup",
    brand: brand ? brand.slice(0, 200) : null,
    from: realDate(searchParams.get("from")),
    to: realDate(searchParams.get("to")),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    all: searchParams.get("all") === "1",
  };
}

/**
 * The expected-date window for a list.
 * Supplier Chaseup: a from and to range, or one exact day, or (nothing given) three days from today.
 * Date Lapsed: a from and to range, or (nothing given) everything due up to and including today.
 */
export function expectedWindow(kind, p, now = new Date()) {
  const today = ukToday(now);
  if (kind === "lapsed") {
    if (p.from && p.to) return { gte: p.from, lte: p.to };
    return { lte: today };
  }
  if (p.from && p.to) return { gte: p.from, lte: p.to };
  const one = p.from ?? p.to;
  if (one) return { equals: one };
  return { equals: addDays(today, 3) };
}

export function buildChaseWhere(shop, p, now = new Date()) {
  const statuses = p.kind === "lapsed" ? LAPSED_STATUSES : CHASE_STATUSES;
  const and = [{ orderArchived: false }, { lineStatusId: { in: statuses } }, { expectedDate: { not: null } }, { expectedDate: { not: "" } }, { expectedDate: expectedWindow(p.kind, p, now) }];
  if (p.brand) and.push(p.brand === "Unmapped" ? { OR: [{ vendor: null }, { vendor: "" }] } : { vendor: p.brand });
  // The old Date Lapsed page left out clearance items and items already sold as in stock (by their product name).
  if (p.kind === "lapsed") and.push({ NOT: { title: { startsWith: "Clearance", mode: "insensitive" } } }, { NOT: { title: { contains: "In Stock", mode: "insensitive" } } });
  return { shop, AND: and };
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** One address, or a comma separated list. Returns the cleaned list text, "" for blank, or null when something is not an address. */
export function cleanEmails(text, max = 5) {
  const parts = String(text ?? "").split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length > max || !parts.every((p) => EMAIL.test(p) && p.length <= 200)) return null;
  return [...new Set(parts.map((p) => p.toLowerCase()))].join(", ");
}

/** The first line of an address list, for the To field. */
export const splitEmails = (list) => (list ? list.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Reads a save of one supplier contact. Returns { value } or { error }. */
export function readContactInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const brand = typeof body.brand === "string" ? body.brand.trim() : "";
  if (!brand || brand.length > 200) return { error: "bad_request" };
  const email = cleanEmails(body.email, 3);
  const cc = cleanEmails(body.cc, 5);
  if (email === null || cc === null) return { error: "bad_email" };
  if (body.handOrdered !== undefined && typeof body.handOrdered !== "boolean") return { error: "bad_request" };
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
  return { value: { brand, email, cc, handOrdered: body.handOrdered === true, address } };
}

/** Reads a Process Order or chase-up request. Returns { value } or { error }. */
export function readProcessRequest(body) {
  const LINE = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
  const ORDER = /^gid:\/\/shopify\/Order\/\d{1,20}$/;
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const { action, lineIds, orderIds, idempotencyKey, dryRun } = body;
  if (action !== "order" && action !== "chaseup") return { error: "bad_request" };
  const hasLines = Array.isArray(lineIds) && lineIds.length > 0;
  const hasOrders = Array.isArray(orderIds) && orderIds.length > 0;
  if (hasLines === hasOrders) return { error: "bad_request" }; // exactly one of the two
  if (hasLines && (lineIds.length > MAX_PROCESS_LINES || !lineIds.every((id) => typeof id === "string" && LINE.test(id)))) return { error: "bad_request" };
  if (hasOrders && (action !== "order" || orderIds.length > MAX_PROCESS_LINES || !orderIds.every((id) => typeof id === "string" && ORDER.test(id)))) return { error: "bad_request" };
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 1 || idempotencyKey.length > 80) return { error: "bad_request" };
  if (dryRun !== undefined && typeof dryRun !== "boolean") return { error: "bad_request" };
  return { value: { action, lineIds: hasLines ? [...new Set(lineIds)] : null, orderIds: hasOrders ? [...new Set(orderIds)] : null, idempotencyKey, dryRun: dryRun === true } };
}

/**
 * Splits lines into what to email and what to leave.
 * Returns { emails: Map(key -> { brand, lines }), handOrdered: lineIds, noSupplier: brands, skipped: lineIds }.
 * `action` "order" sends one email per order and brand; "chaseup" one per brand.
 * `contacts` maps brand to { email, handOrdered }.
 */
export function planSupplierEmails({ action, lines, contacts }) {
  const emails = new Map();
  const handOrdered = [];
  const skipped = [];
  const noSupplier = new Set();
  for (const line of lines) {
    if (NOT_ORDERABLE_STATUSES.includes(line.lineStatusId)) { skipped.push(line.lineId); continue; }
    const brand = line.vendor?.trim() || "Unmapped";
    const contact = contacts.get(brand);
    if (contact?.handOrdered) { handOrdered.push(line.lineId); continue; }
    if (!contact?.email) { noSupplier.add(brand); continue; }
    const key = action === "order" ? `${line.orderId}|${brand}` : brand;
    if (!emails.has(key)) emails.set(key, { brand, orderId: line.orderId, lines: [] });
    emails.get(key).lines.push(line);
  }
  return { emails, handOrdered, noSupplier: [...noSupplier].sort(), skipped };
}
