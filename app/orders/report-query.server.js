// Reads the saved order copies for a report and builds its CSV. Reports only read; nothing is changed.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { listBrandTerms } from "./brand-terms.server.js";
import { lookupCosts } from "./export-query.server.js";
import { DELIVERY_STATUS_IDS, MAX_REPORT_ORDERS, OUTSTANDING_STATUS_IDS, brandTermsCsv, deliveryCsv, outstandingCsv, outstandingRow, xeroCsv } from "./report-rules.js";

const statusLabels = new Map(statuses.map((s) => [s.id, s.label]));

const ORDER_FIELDS = {
  orderId: true, name: true, createdAt: true, cancelledAt: true, customerName: true, email: true, currency: true, totalMinor: true,
  outstandingMinor: true, phone: true, billingAddress: true, shippingAddress: true,
};

/**
 * Outstanding payments: product lines of brands set to `terms` that are in a "still owed" status, whose supplier invoice is not marked paid,
 * on orders placed in the range. Cancelled orders and removed lines are left out. Cost comes from Shopify (blank if it cannot be read).
 */
async function buildOutstanding({ db, graphql, shop, range, terms }) {
  const brands = (await db.brandTerms.findMany({ where: { shop, terms } })).map((b) => b.brand);
  const empty = { csv: outstandingCsv([]), count: 0, capped: false, brands: brands.length, costLookup: "not_needed" };
  if (brands.length === 0) return empty;

  const found = await db.orderLine.findMany({
    where: { shop, vendor: { in: brands }, lineStatusId: { in: OUTSTANDING_STATUS_IDS[terms] }, quantity: { gt: 0 }, orderCreatedAt: { gte: range.gte, lte: range.lte } },
    orderBy: [{ orderCreatedAt: "asc" }, { lineId: "asc" }],
    take: MAX_REPORT_ORDERS + 1,
  });
  const capped = found.length > MAX_REPORT_ORDERS;
  const lines = capped ? found.slice(0, MAX_REPORT_ORDERS) : found;
  if (lines.length === 0) return empty;

  const [paid, orders] = await Promise.all([
    db.lineSupplierInvoice.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) }, paid: true }, select: { lineId: true } }),
    db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } }, select: { orderId: true, name: true, cancelledAt: true } }),
  ]);
  const paidIds = new Set(paid.map((p) => p.lineId));
  const byOrder = new Map(orders.map((o) => [o.orderId, o]));
  const owed = lines.filter((l) => !paidIds.has(l.lineId) && byOrder.has(l.orderId) && !byOrder.get(l.orderId).cancelledAt);

  let costs = new Map();
  let costLookup = "ok";
  try {
    costs = await lookupCosts(graphql, owed.map((l) => l.variantId));
  } catch (error) {
    console.error("Report: cost lookup failed", error.message);
    costLookup = "unavailable";
  }
  const rows = owed.map((l) =>
    outstandingRow(l, {
      orderName: byOrder.get(l.orderId).name, orderCreatedAt: l.orderCreatedAt, statusLabel: statusLabels.get(l.lineStatusId) ?? null,
      costMinor: costs.get(l.variantId)?.costMinor ?? null,
    }),
  );
  return { csv: outstandingCsv(rows), count: rows.length, capped, brands: brands.length, costLookup };
}

/**
 * { csv, count, capped }. kind "xero" needs range { gte, lte } (orders placed in it, cancelled ones left out);
 * kind "delivery" takes every order whose product lines are ready for delivery, with nothing owed;
 * kind "outstanding" needs range and terms ("credit" or "proforma") and `graphql` for item costs.
 */
export async function buildReport({ db, graphql, shop, kind, range, terms }) {
  if (kind === "brandterms") {
    const rows = await listBrandTerms(db, shop);
    return { csv: brandTermsCsv(rows), count: rows.length, capped: false };
  }
  if (kind === "outstanding") return buildOutstanding({ db, graphql, shop, range, terms });
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
