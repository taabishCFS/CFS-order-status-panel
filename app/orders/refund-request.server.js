// Saves and lists refund requests. App-owned: a request is a line in the refund list for accounts to act on; no money moves here.
import { refundableMinor } from "./refund-request.js";

const shape = (r) => ({
  id: r.id,
  reason: r.reason,
  type: r.type,
  amountMinor: r.amountMinor,
  lineIds: r.lineIds,
  notes: r.notes,
  status: r.status,
  createdByName: r.createdByName,
  createdAt: r.createdAt.toISOString(),
});

const requestedSum = async (db, shop, orderId) =>
  (await db.refundRequest.aggregate({ where: { shop, orderId, status: "requested" }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0;

/** @returns {Promise<{ok:true,request:object,duplicate?:true}|{ok:false,code:"no_order"|"no_line"}|{ok:false,code:"too_much",refundableMinor:number}>} */
export async function addRefundRequest(db, { shop, orderId, input, actor }) {
  const order = await db.order.findFirst({ where: { shop, orderId }, select: { name: true, totalMinor: true, refundedMinor: true } });
  if (!order) return { ok: false, code: "no_order" };

  // The same key sent twice (a double click) gives back the first request.
  const earlier = await db.refundRequest.findFirst({ where: { shop, clientKey: input.clientKey } });
  if (earlier) return { ok: true, request: shape(earlier), duplicate: true };

  const lineIds = [...new Set(input.lineIds)];
  if (lineIds.length && (await db.orderLine.count({ where: { shop, orderId, lineId: { in: lineIds } } })) !== lineIds.length) return { ok: false, code: "no_line" };

  const refundable = refundableMinor(order, await requestedSum(db, shop, orderId));
  const amountMinor = input.amountMinor ?? refundable;
  if (amountMinor <= 0 || amountMinor > refundable) return { ok: false, code: "too_much", refundableMinor: refundable };

  const created = await db.refundRequest.create({
    data: { shop, orderId, orderName: order.name, clientKey: input.clientKey, reason: input.reason, type: input.type, amountMinor, lineIds, notes: input.notes, status: "requested", createdById: actor.id, createdByName: actor.name },
  });
  return { ok: true, request: shape(created) };
}

/** The order's requests, newest first, and what can still be asked for. */
export async function listRefundRequests(db, shop, orderId) {
  const order = await db.order.findFirst({ where: { shop, orderId }, select: { name: true, totalMinor: true, refundedMinor: true } });
  const rows = await db.refundRequest.findMany({ where: { shop, orderId }, orderBy: { createdAt: "desc" } });
  return { requests: rows.map(shape), refundableMinor: order ? refundableMinor(order, await requestedSum(db, shop, orderId)) : 0 };
}
