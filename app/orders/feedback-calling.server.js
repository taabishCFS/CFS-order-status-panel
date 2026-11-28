// Feedback Calling (legacy "feedback_calling"): orders whose every item is Completed, so staff can phone the customer for a review.
// The list is by the day the order was completed (the latest day any of its items was set to Completed). Orders whose completed
// day is not known (completed before the app kept it) show on every day, as the old page did.
export const PAGE_SIZE = 50;
export const MAX_ALL = 2000;
export const COMPLETED = 6;
export const CALL_STATUSES = ["Completed", "Pending"];
// The old page's callers; the list starts with them and is then kept on the page.
export const DEFAULT_CALLERS = ["Hameed", "Harris", "Shree", "Tabshir", "Vinod", "Shezi"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v) => (typeof v === "string" && DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);
export const ukToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const addDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Reads ?from=&to=&q=&staff=&page=&all=1. No dates means today; one date means that one day. */
export function parseFeedbackParams(searchParams, now = new Date()) {
  let from = realDay(searchParams.get("from"));
  let to = realDay(searchParams.get("to"));
  if (!from && !to) from = to = ukToday(now);
  else if (!to) to = from;
  else if (!from) from = to;
  if (from > to) [from, to] = [to, from];
  const page = Number(searchParams.get("page"));
  return {
    from, to,
    q: (searchParams.get("q") ?? "").trim().replace(/^#/, "").slice(0, 50),
    staff: (searchParams.get("staff") ?? "").trim().slice(0, 50),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    all: searchParams.get("all") === "1",
  };
}

const squash = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

/** Every order in the filter (before paging), newest completed first: [{ order, completed, call }]. */
async function matching(db, shop, p) {
  const orders = await db.order.findMany({
    where: { shop, cancelledAt: null, lineStatusIds: { equals: [COMPLETED] } },
    select: { orderId: true, name: true, createdAt: true, postcode: true },
  });
  const needle = squash(p.q);
  const candidates = needle ? orders.filter((o) => squash(o.name).includes(needle) || squash(o.postcode).includes(needle)) : orders;
  if (candidates.length === 0) return [];
  const ids = candidates.map((o) => o.orderId);
  const [lines, calls] = await Promise.all([
    db.orderLine.findMany({ where: { shop, orderId: { in: ids } }, select: { orderId: true, lineStatusId: true, completedDate: true } }),
    db.feedbackCall.findMany({ where: { shop, orderId: { in: ids } } }),
  ]);
  const byOrder = new Map();
  for (const l of lines) {
    if (!byOrder.has(l.orderId)) byOrder.set(l.orderId, []);
    byOrder.get(l.orderId).push(l);
  }
  const callOf = new Map(calls.map((c) => [c.orderId, c]));
  const out = [];
  for (const order of candidates) {
    const ls = byOrder.get(order.orderId) ?? [];
    // Every item must be Completed (an item with no status at all keeps the order off, as in the old page).
    if (ls.length === 0 || !ls.every((l) => l.lineStatusId === COMPLETED)) continue;
    const days = ls.map((l) => l.completedDate).filter(Boolean).sort();
    const completed = days.length ? days[days.length - 1] : null;
    if (completed && (completed < p.from || completed > p.to)) continue;
    const call = callOf.get(order.orderId) ?? null;
    if (p.staff && (call?.staff ?? "") !== p.staff) continue;
    out.push({ order, completed, call });
  }
  // Newest completed first; unknown completed days last; then newest order.
  out.sort((a, b) => (b.completed ?? "").localeCompare(a.completed ?? "") || b.order.createdAt - a.order.createdAt);
  return out;
}

const toRow = ({ order, completed, call }) => ({
  orderId: order.orderId,
  orderName: order.name,
  orderDate: order.createdAt,
  completedDate: completed,
  month: completed ? MONTHS[Number(completed.slice(5, 7)) - 1] : "",
  allocDate: completed ? addDay(completed) : null,
  callDate: call?.callDate ?? "",
  staff: call?.staff ?? "",
  callStatus: call?.callStatus ?? "",
  remark: call?.remark ?? "",
  remark2: call?.remark2 ?? "",
  rating: call?.rating ?? "",
  ratingDate: call?.ratingDate ?? "",
  updatedByName: call?.updatedByName ?? null,
});

/** The callers, oldest first. The first time, the list is filled with the old page's six names. */
export async function listCallers(db, shop) {
  let rows = await db.feedbackCaller.findMany({ where: { shop }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  if (rows.length === 0) {
    await db.feedbackCaller.createMany({ data: DEFAULT_CALLERS.map((name, i) => ({ shop, name, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) })), skipDuplicates: true });
    rows = await db.feedbackCaller.findMany({ where: { shop }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  }
  return rows.map((r) => r.name);
}

/** { rows, total, page, pageCount, size, callers, from, to } */
export async function listFeedbackCalls(db, shop, p) {
  const [all, callers] = await Promise.all([matching(db, shop, p), listCallers(db, shop)]);
  const total = all.length;
  const size = p.all ? MAX_ALL : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = p.all ? 1 : Math.min(p.page, pageCount);
  return { rows: all.slice((page - 1) * size, page * size).map(toRow), total, page, pageCount, size, callers, from: p.from, to: p.to, capped: p.all && total > MAX_ALL };
}

const ORDER = /^gid:\/\/shopify\/Order\/\d{1,20}$/;
const TEXT_LIMIT = { remark: 1000, remark2: 1000, rating: 50 };

/** Reads one field save { orderId, field, value }. Returns { value } or { error }. */
export function readCallSave(body, callers) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const { orderId, field } = body;
  const raw = typeof body.value === "string" ? body.value.trim() : body.value == null ? "" : null;
  if (typeof orderId !== "string" || !ORDER.test(orderId) || raw === null) return { error: "bad_request" };
  if (field === "callDate" || field === "ratingDate") {
    if (raw && !realDay(raw)) return { error: "bad_date" };
  } else if (field === "staff") {
    if (raw && !callers.includes(raw)) return { error: "bad_staff" };
  } else if (field === "callStatus") {
    if (raw && !CALL_STATUSES.includes(raw)) return { error: "bad_request" };
  } else if (field in TEXT_LIMIT) {
    if (raw.length > TEXT_LIMIT[field]) return { error: "too_long" };
  } else {
    return { error: "bad_request" };
  }
  return { value: { orderId, field, value: raw || null } };
}

/** Saves one field of an order's call. The order must be on this shop. */
export async function saveCallField(db, shop, { orderId, field, value }, staff) {
  const order = await db.order.findFirst({ where: { shop, orderId }, select: { name: true } });
  if (!order) return { ok: false, error: "not_found" };
  const data = { orderName: order.name, [field]: value, updatedByName: staff.name };
  await db.feedbackCall.upsert({ where: { shop_orderId: { shop, orderId } }, create: { shop, orderId, ...data }, update: data });
  return { ok: true };
}

/**
 * Shares the orders in the filter that have no caller among the callers in turn, starting again with the first caller on each
 * completed day (the old page's fair split). Returns { ok, assigned }.
 */
export async function shareOut(db, shop, p, staff) {
  const callers = await listCallers(db, shop);
  if (callers.length === 0) return { ok: false, error: "no_callers" };
  const unassigned = (await matching(db, shop, { ...p, staff: "" })).filter((x) => !x.call?.staff);
  unassigned.sort((a, b) => (a.completed ?? "").localeCompare(b.completed ?? "") || a.order.orderId.localeCompare(b.order.orderId));
  let day;
  let n = 0;
  for (const x of unassigned) {
    if (x.completed !== day) { day = x.completed; n = 0; }
    const data = { orderName: x.order.name, staff: callers[n % callers.length], updatedByName: staff.name };
    await db.feedbackCall.upsert({ where: { shop_orderId: { shop, orderId: x.order.orderId } }, create: { shop, orderId: x.order.orderId, ...data }, update: data });
    n += 1;
  }
  return { ok: true, assigned: unassigned.length };
}

/** Adds { add: name } or removes { remove: name } a caller. Orders keep the name they were given. */
export async function changeCallers(db, shop, body) {
  const callers = await listCallers(db, shop);
  if (typeof body?.add === "string") {
    const name = body.add.trim().replace(/\s+/g, " ");
    if (!name || name.length > 50) return { ok: false, error: "bad_name" };
    if (callers.some((c) => c.toLowerCase() === name.toLowerCase())) return { ok: false, error: "exists" };
    await db.feedbackCaller.create({ data: { shop, name } });
    return { ok: true, callers: [...callers, name] };
  }
  if (typeof body?.remove === "string") {
    if (!callers.includes(body.remove)) return { ok: false, error: "not_found" };
    if (callers.length === 1) return { ok: false, error: "last_caller" };
    await db.feedbackCaller.delete({ where: { shop_name: { shop, name: body.remove } } });
    return { ok: true, callers: callers.filter((c) => c !== body.remove) };
  }
  return { ok: false, error: "bad_request" };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dmy = (d) => (d ? d.split("-").reverse().join("/") : "");
const ukDmy = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) : "");

/** The page's table as a CSV (every matching order, up to 2,000). */
export async function feedbackCsv(db, shop, p) {
  const list = await listFeedbackCalls(db, shop, { ...p, all: true });
  const head = ["Order Date", "Completed Date", "Order No.", "Month", "Alloc.Date", "Calling Date", "Staff", "Call Status", "Remark", "Remark 2", "Rating Recv", "Rating Date"];
  const body = list.rows.map((r) => [ukDmy(r.orderDate), dmy(r.completedDate), r.orderName, r.month, dmy(r.allocDate), dmy(r.callDate), r.staff, r.callStatus, r.remark, r.remark2, r.rating, dmy(r.ratingDate)]);
  const csv = `﻿${[head.join(","), ...body.map((r) => r.map(cell).join(","))].join("\r\n")}\r\n`;
  return { csv, count: body.length, fileName: `Feedback-Calling-${dmy(p.from).replace(/\//g, "-")}${p.to !== p.from ? `-to-${dmy(p.to).replace(/\//g, "-")}` : ""}.csv` };
}
