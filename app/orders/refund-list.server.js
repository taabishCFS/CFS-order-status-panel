// The accounts refund list (legacy Refund Orders List): reads the requests with their order, and records what accounts do.
// Accounts refund in the payment provider; saving the transaction id here is what marks a request refunded. No money moves here.
import { MAX_ALL, PAGE_SIZE, buildRefundWhere, claimableApplies, paidMinor, refundOrderBy, viewOf } from "./refund-list.js";

const LIVE = ["requested", "done"];
const bare = (name) => String(name ?? "").trim().replace(/^#/, "");
const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};
const byOrderId = (orders) => new Map(orders.map((o) => [o.orderId, o]));
const ordersOf = (db, shop, rows) => (rows.length ? db.order.findMany({ where: { shop, orderId: { in: [...new Set(rows.map((r) => r.orderId))] } } }).then(byOrderId) : new Map());

/** One page of the list: { rows, total, page, pageCount, capped, view }. */
export async function listRefunds(db, shop, params) {
  const where = buildRefundWhere(shop, params);
  const total = await db.refundRequest.count({ where });
  const size = params.all ? MAX_ALL : PAGE_SIZE;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / size));
  const page = params.all ? 1 : Math.min(params.page, pageCount);
  const found = await db.refundRequest.findMany({ where, orderBy: refundOrderBy(params), skip: (page - 1) * size, take: size });
  const orders = await ordersOf(db, shop, found);
  const rows = found.map((r) => {
    const o = orders.get(r.orderId);
    return {
      id: r.id,
      orderId: r.orderId,
      orderName: r.orderName,
      orderDate: o ? o.createdAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      type: r.type,
      reason: r.reason,
      notes: r.notes,
      amountMinor: r.amountMinor,
      paidMinor: o ? paidMinor(o) : null,
      currency: o?.currency ?? "GBP",
      gateway: o?.gateway ?? null,
      status: r.status,
      transactionId: r.transactionId,
      refundedAt: r.refundedAt ? r.refundedAt.toISOString() : null,
      refundedBy: r.refundedByName,
      addedBy: r.createdByName,
      manual: r.manual,
      claimable: r.claimable,
      claimableApplies: claimableApplies(r.reason),
    };
  });
  return { rows, total, page, pageCount, capped: params.all && total > MAX_ALL, view: viewOf(params) };
}

/** Saves the transaction id and marks the request refunded. @returns {Promise<{ok:true,request:object}|{ok:false,code:string}>} */
export async function markRefunded(db, { shop, id, transactionId, actor, now = new Date() }) {
  const txn = String(transactionId ?? "").trim();
  if (txn.length < 1 || txn.length > 80) return { ok: false, code: "bad_transaction_id" };
  const r = await db.refundRequest.findFirst({ where: { shop, id } });
  if (!r || r.status === "cancelled") return { ok: false, code: "no_request" };
  if (r.status === "done" && r.transactionId) return { ok: false, code: "already_refunded" };
  await db.refundRequest.update({ where: { id }, data: { status: "done", transactionId: txn, refundedAt: now, refundedByName: actor.name } });
  return { ok: true, request: { id: r.id, orderId: r.orderId, orderName: r.orderName, amountMinor: r.amountMinor, reason: r.reason, transactionId: txn } };
}

/** Claimable? on a refunded damaged or defect request. An empty value clears it. */
export async function setClaimable(db, { shop, id, value }) {
  if (value !== "claimable" && value !== "non_claimable" && value !== "") return { ok: false, code: "bad_value" };
  const r = await db.refundRequest.findFirst({ where: { shop, id } });
  if (!r || r.status === "cancelled") return { ok: false, code: "no_request" };
  if (r.status !== "done" || !claimableApplies(r.reason)) return { ok: false, code: "not_applicable" };
  await db.refundRequest.update({ where: { id }, data: { claimable: value || null } });
  return { ok: true };
}

/** Takes the ticked requests off the list. They are kept, marked removed with who and when, and no longer count as requested. */
export async function removeRefunds(db, { shop, ids, actor, now = new Date() }) {
  if (!ids.length) return { ok: false, code: "nothing_selected" };
  const res = await db.refundRequest.updateMany({ where: { shop, id: { in: ids }, status: { in: LIVE } }, data: { status: "cancelled", removedAt: now, removedByName: actor.name } });
  return { ok: true, count: res.count };
}

/** Legacy Add Order: an entry for a refund already made. input = { clientKey, orderName, reason, type, amountMinor, notes, transactionId } */
export async function addManualRefund(db, { shop, input, actor, now = new Date() }) {
  const clientKey = `manual-${input.clientKey}`;
  const earlier = await db.refundRequest.findFirst({ where: { shop, clientKey } });
  if (earlier) return { ok: true, duplicate: true, request: { id: earlier.id } };
  const n = bare(input.orderName);
  const order = await db.order.findFirst({ where: { shop, name: { in: [`#${n}`, n] } } });
  if (!order) return { ok: false, code: "no_order" };
  const txn = (input.transactionId ?? "").trim();
  const created = await db.refundRequest.create({
    data: {
      shop, orderId: order.orderId, orderName: order.name, clientKey, reason: input.reason, type: input.type, amountMinor: input.amountMinor, lineIds: [], notes: input.notes,
      status: "done", manual: true, createdById: actor.id, createdByName: `${actor.name}- Manual Add`,
      transactionId: txn || null, refundedAt: txn ? now : null, refundedByName: txn ? actor.name : null,
    },
  });
  return { ok: true, request: { id: created.id, orderId: order.orderId, orderName: order.name, amountMinor: input.amountMinor, reason: input.reason } };
}

const exportShape = (r, o) => ({
  createdAt: r.createdAt,
  orderName: r.orderName,
  orderCreatedAt: o?.createdAt ?? null,
  payMode: o?.gateway ?? "",
  amountMinor: r.amountMinor,
  type: r.type,
  reason: r.reason,
  notes: r.notes,
  refunded: r.status === "done" ? "Yes" : "",
  refundedAt: r.refundedAt,
  operator: r.createdByName ?? "",
  claimable: r.claimable,
  brands: o?.brands ?? [],
  email: o?.email ?? "",
  billing: parseJson(o?.billingAddress),
});

/**
 * Rows for a CSV. Exactly one of: { ids } (ticked rows), { params } (everything the list's filters show),
 * { refundedFrom, refundedTo } (refunds dated between two days, newest first, for Xero).
 */
export async function exportRows(db, shop, { ids, params, refundedFrom, refundedTo }) {
  let query;
  if (ids) query = { where: { shop, id: { in: ids }, status: { in: LIVE } }, orderBy: { createdAt: "desc" } };
  else if (params) query = { where: buildRefundWhere(shop, params), orderBy: refundOrderBy(params), take: MAX_ALL };
  else query = { where: { shop, status: "done", refundedAt: { gte: new Date(`${refundedFrom}T00:00:00.000Z`), lte: new Date(`${refundedTo}T23:59:59.999Z`) } }, orderBy: { refundedAt: "desc" } };
  const found = await db.refundRequest.findMany(query);
  const orders = await ordersOf(db, shop, found);
  return found.map((r) => exportShape(r, orders.get(r.orderId)));
}
