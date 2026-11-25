// The Delivery Report CSV (Max) page: every paid order that still has something to deliver and is not yet booked or sent by a carrier.
import { ALL_SIZE, MAXPRO_STATUSES, PAGE_SIZE, RESTRICTED_STATUSES, matchesSearch, maxproRow, orderIsWhiteGlove } from "./maxpro-rules.js";

const OWN = "CFS";
const wanted = new Set(MAXPRO_STATUSES);
const restricted = new Set(RESTRICTED_STATUSES);
/** A booking that takes a line off the list: a carrier mark, or a real (not pre-booked) date. */
const leavesList = (b) => b.partner !== OWN || (Boolean(b.date) && !b.prebook);

/** All listed orders (newest first) with their rows: [{ row, deliverable, whiteGlove, brandSet }]. */
async function eligible(db, shop) {
  const open = await db.orderLine.findMany({ where: { shop, lineStatusId: { in: MAXPRO_STATUSES }, orderArchived: false }, select: { orderId: true } });
  const orderIds = [...new Set(open.map((l) => l.orderId))];
  if (orderIds.length === 0) return [];
  const [orders, lines, booked] = await Promise.all([
    db.order.findMany({ where: { shop, orderId: { in: orderIds } } }),
    db.orderLine.findMany({ where: { shop, orderId: { in: orderIds } }, orderBy: { id: "asc" } }),
    db.deliveryBooking.findMany({ where: { shop, orderId: { in: orderIds } } }),
  ]);
  const linesOf = new Map();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);
  const bookingOf = new Map(booked.map((b) => [b.lineId, b]));

  const out = [];
  for (const o of orders) {
    if (o.cancelledAt || o.archivedAt || (o.outstandingMinor ?? 0) > 0) continue;
    const all = linesOf.get(o.orderId) ?? [];
    if (all.some((l) => restricted.has(l.lineStatusId))) continue;
    const deliverable = all.filter((l) => wanted.has(l.lineStatusId) && !(bookingOf.get(l.lineId) && leavesList(bookingOf.get(l.lineId))));
    if (deliverable.length === 0) continue;
    out.push({ order: o, row: { ...maxproRow(o, all), deliverable: deliverable.length, deliverableLineIds: deliverable.map((l) => l.lineId) }, whiteGlove: orderIsWhiteGlove(all.map((l) => l.title)), vendors: new Set(all.map((l) => l.vendor?.trim() || "Unmapped")) });
  }
  return out.sort((a, b) => b.order.createdAt - a.order.createdAt || a.order.name.localeCompare(b.order.name));
}

/**
 * One page of the Maxpro list: { rows, total, page, pageCount, size }.
 * params: { q, brand, whiteGlove, all, page }. White Glove orders are shown only when asked for; the normal list leaves them out.
 */
export async function listMaxpro(db, shop, params) {
  const picked = (await eligible(db, shop)).filter((e) => e.whiteGlove === params.whiteGlove && (!params.brand || e.vendors.has(params.brand)) && matchesSearch(params.q, e.order));
  const size = params.all ? ALL_SIZE : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(picked.length / size));
  const page = Math.min(params.page, pageCount);
  return { rows: picked.slice((page - 1) * size, page * size).map((e) => e.row), total: picked.length, page, pageCount, size };
}

/** The rows for an export: the listed orders among `orderIds`, in list order (ids that are not on the list are ignored). */
export async function maxproRowsFor(db, shop, orderIds) {
  const wantedIds = new Set(orderIds);
  return (await eligible(db, shop)).filter((e) => wantedIds.has(e.order.orderId)).map((e) => e.row);
}
