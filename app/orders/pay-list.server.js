// Supplier Payments (legacy accountsPayToSupplier): each staff member's own list of lines to pay, filled by "Add To Accounts" on the order page.
import { PAGE_SIZE, rowsFor } from "./pay-supplier.server.js";

const LINE = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;

/** Reads a POST body: op add | remove with line IDs. Returns { value } or { error }. */
export function readPayListInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  if (body.op !== "add" && body.op !== "remove") return { error: "bad_request" };
  const lineIds = Array.isArray(body.lineIds) ? [...new Set(body.lineIds.filter((l) => typeof l === "string" && LINE.test(l)))].slice(0, 500) : [];
  return lineIds.length ? { value: { op: body.op, lineIds } } : { error: "nothing_selected" };
}

/** Puts lines on the staff member's list. A line already on anyone's list is not added again (as in the old system). { ok, added, already }. */
export async function addToPayList(db, shop, lineIds, staff) {
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds } }, select: { lineId: true, orderId: true } });
  const listed = new Set((await db.payListLine.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) } } })).map((r) => r.lineId));
  let added = 0;
  for (const l of lines) {
    if (listed.has(l.lineId)) continue;
    await db.payListLine.create({ data: { shop, lineId: l.lineId, orderId: l.orderId, staffId: staff.id, staffName: staff.name ?? null } });
    added += 1;
  }
  return { ok: true, added, already: lines.length - added };
}

/** Takes lines off the staff member's own list (the order lines themselves are untouched). */
export async function removeFromPayList(db, shop, lineIds, staff) {
  const res = await db.payListLine.deleteMany({ where: { shop, staffId: staff.id, lineId: { in: lineIds } } });
  return { ok: true, removed: res.count };
}

/** One page of the staff member's list, newest added first, in the Pay To Supplier row shape. { rows, total, page, pageCount, size, pageTotalMinor, costLookup }. */
export async function listPayList(db, graphql, shop, staff, params = {}) {
  const entries = (await db.payListLine.findMany({ where: { shop, staffId: staff.id } })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const lines = entries.length ? await db.orderLine.findMany({ where: { shop, lineId: { in: entries.map((e) => e.lineId) } } }) : [];
  const orders = lines.length ? await db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } }, select: { orderId: true, name: true } }) : [];
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const lineOf = new Map(lines.map((l) => [l.lineId, l]));
  const q = (params.q ?? "").toLowerCase();
  const shown = entries.map((e) => lineOf.get(e.lineId)).filter((l) => l && orderOf.has(l.orderId) && (!q || String(orderOf.get(l.orderId).name).toLowerCase().includes(q)));
  const total = shown.length;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = params.all ? 1 : Math.min(Math.max(1, params.page ?? 1), pageCount);
  const slice = params.all ? shown : shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { rows, costLookup } = await rowsFor(db, graphql, shop, slice, orderOf);
  return { rows, total, page, pageCount, size: PAGE_SIZE, brands: [], pageTotalMinor: rows.reduce((s, r) => s + (r.finalMinor ?? 0), 0), costLookup };
}
