// Reads the saved order copies for a report and builds its CSV. Both reports only read; nothing is changed.
import { DELIVERY_STATUS_IDS, MAX_REPORT_ORDERS, deliveryCsv, xeroCsv } from "./report-rules.js";

const ORDER_FIELDS = {
  orderId: true, name: true, createdAt: true, cancelledAt: true, customerName: true, email: true, currency: true, totalMinor: true,
  outstandingMinor: true, phone: true, billingAddress: true, shippingAddress: true,
};

/**
 * { csv, count, capped }. kind "xero" needs range { gte, lte } (orders placed in it, cancelled ones left out);
 * kind "delivery" takes every order whose product lines are ready for delivery, with nothing owed.
 */
export async function buildReport({ db, shop, kind, range }) {
  const where =
    kind === "xero"
      ? { shop, cancelledAt: null, createdAt: { gte: range.gte, lte: range.lte } }
      : { shop, cancelledAt: null, archivedAt: null, outstandingMinor: { lte: 0 }, lineStatusIds: { hasSome: DELIVERY_STATUS_IDS } };
  const found = await db.order.findMany({ where, select: ORDER_FIELDS, orderBy: kind === "xero" ? { createdAt: "asc" } : { createdAt: "desc" }, take: MAX_REPORT_ORDERS + 1 });
  const capped = found.length > MAX_REPORT_ORDERS;
  const orders = capped ? found.slice(0, MAX_REPORT_ORDERS) : found;

  const lines = orders.length
    ? await db.orderLine.findMany({ where: { shop, orderId: { in: orders.map((o) => o.orderId) } }, select: { orderId: true, lineId: true, sku: true, title: true, vendor: true, lineStatusId: true }, orderBy: { lineId: "asc" } })
    : [];
  const byOrder = new Map();
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);

  if (kind === "xero") return { csv: xeroCsv(orders, byOrder), count: orders.length, capped };
  return { ...deliveryCsv(orders, byOrder), capped };
}
