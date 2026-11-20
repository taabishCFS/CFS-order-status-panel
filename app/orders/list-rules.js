// Pure rules for the order lists: reading the query string, search words, the red/blue and Pay Type rules,
// and the database filters. No database access here.
export const PAGE_SIZE = 50;
export const MAX_ALL_ORDERS = 2000;
export const MAX_ALL_LINES = 5000;
export const HIDDEN_LINE_STATUSES = [6, 7, 9, 32, 58, 66, 50];
export const HIDDEN_ORDER_STATUSES = [9];
export const FAILED_ORDER_STATUSES = [7, 32, 50];
const MAX_QUERY_LENGTH = 120;
const MAX_TERMS = 6;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v) => (v && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)) && new Date(`${v}T00:00:00.000Z`).toISOString().startsWith(v) ? v : null);
const text = (v, max = 200) => (v && v.trim() ? v.trim().slice(0, max) : null);

export function parseListParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const status = searchParams.get("statusId");
  return {
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    all: searchParams.get("all") === "1",
    brand: text(searchParams.get("brand")),
    from: realDate(searchParams.get("from")),
    to: realDate(searchParams.get("to")),
    q: (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    statusId: status !== null && /^\d{1,4}$/.test(status) ? Number(status) : null,
    takenBy: text(searchParams.get("takenBy")),
    archived: searchParams.get("archived") === "1",
    insurance: searchParams.get("insurance") === "1",
  };
}

export const searchTerms = (q) => (q ?? "").split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);

// One of: paid, partial, awaiting, failed.
export function payType({ financialStatus, cancelledAt, orderStatusId }) {
  if (cancelledAt || financialStatus === "VOIDED" || FAILED_ORDER_STATUSES.includes(orderStatusId)) return "failed";
  if (financialStatus === "PAID") return "paid";
  if (financialStatus === "PARTIALLY_PAID" || financialStatus === "PARTIALLY_REFUNDED" || financialStatus === "REFUNDED") return "partial";
  return "awaiting";
}

// Red: partially paid (the legacy "balance still owed"). Blue: a replacement order (number starts with R).
export function rowTone({ name, financialStatus }) {
  if (financialStatus === "PARTIALLY_PAID") return "red";
  if (/^R/i.test((name ?? "").replace(/^#/, ""))) return "blue";
  return null;
}

function dateRange(field, from, to) {
  if (!from && !to) return null;
  return { [field]: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } };
}

export function buildOrderWhere(shop, p) {
  const terms = searchTerms(p.q);
  const and = [p.archived ? { archivedAt: { not: null } } : { archivedAt: null }];
  if (terms.length === 0) and.push({ OR: [{ orderStatusId: null }, { orderStatusId: { notIn: HIDDEN_ORDER_STATUSES } }] });
  const range = dateRange("createdAt", p.from, p.to);
  if (range) and.push(range);
  if (p.brand) and.push({ brands: { has: p.brand } });
  if (p.statusId !== null) and.push({ lineStatusIds: { has: p.statusId } });
  if (p.takenBy) and.push({ orderTakenBy: p.takenBy });
  for (const term of terms) {
    const contains = { contains: term, mode: "insensitive" };
    and.push({ OR: [{ name: contains }, { customerName: contains }, { email: contains }, { phone: contains }, { postcode: contains }] });
  }
  return { shop, AND: and };
}

export function buildLineWhere(shop, p) {
  const and = [{ orderArchived: p.archived }];
  and.push(p.statusId !== null ? { lineStatusId: p.statusId } : { OR: [{ lineStatusId: null }, { lineStatusId: { notIn: HIDDEN_LINE_STATUSES } }] });
  if (p.brand) and.push(p.brand === "Unmapped" ? { OR: [{ vendor: null }, { vendor: "" }] } : { vendor: p.brand });
  const range = dateRange("orderCreatedAt", p.from, p.to);
  if (range) and.push(range);
  if (p.insurance) and.push({ title: { contains: "insurance", mode: "insensitive" } });
  return { shop, AND: and };
}
