// Reads the saved order copies for a report and builds its CSV. Reports only read; nothing is changed.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { listBrandTerms } from "./brand-terms.server.js";
import { freeStockCsv, freeStockSampleCsv } from "./free-stock-rules.js";
import { allFreeStock } from "./free-stock.server.js";
import { lookupCosts } from "./export-query.server.js";
import {
  DELIVERY_STATUS_IDS, DHD_WITH_SUPPLIER, MAX_REPORT_ORDERS, OUTSTANDING_STATUS_IDS, STOCK_REPORTS, brandTermsCsv, deliveryCsv, outstandingCsv, outstandingRow, stockCsv, stockRow, xeroCsv,
} from "./report-rules.js";

const statusLabels = new Map(statuses.map((s) => [s.id, s.label]));

const ORDER_FIELDS = {
  orderId: true, name: true, createdAt: true, cancelledAt: true, customerName: true, email: true, currency: true, totalMinor: true,
  outstandingMinor: true, phone: true, billingAddress: true, shippingAddress: true,
};

/**
 * Product lines matching `where` whose supplier invoice is not marked paid and whose order is not cancelled, oldest first.
 * Returns { owed, byOrder, capped }. Removed lines (quantity 0) are always left out.
 */
async function owedLines(db, shop, where) {
  const found = await db.orderLine.findMany({
    where: { ...where, shop, quantity: { gt: 0 } },
    orderBy: [{ orderCreatedAt: "asc" }, { lineId: "asc" }],
    take: MAX_REPORT_ORDERS + 1,
  });
  const capped = found.length > MAX_REPORT_ORDERS;
  const lines = capped ? found.slice(0, MAX_REPORT_ORDERS) : found;
  if (lines.length === 0) return { owed: [], byOrder: new Map(), capped: false };

  const [paid, orders] = await Promise.all([
    db.lineSupplierInvoice.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) }, paid: true }, select: { lineId: true } }),
    db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } }, select: { orderId: true, name: true, cancelledAt: true } }),
  ]);
  const paidIds = new Set(paid.map((p) => p.lineId));
  const byOrder = new Map(orders.map((o) => [o.orderId, o]));
  return { owed: lines.filter((l) => !paidIds.has(l.lineId) && byOrder.has(l.orderId) && !byOrder.get(l.orderId).cancelledAt), byOrder, capped };
}

/** Shopify cost per item for these lines: { costs: Map(variantId -> { costMinor }), costLookup: "ok" | "unavailable" }. A failure leaves costs blank. */
async function costsFor(graphql, owed) {
  try {
    return { costs: await lookupCosts(graphql, owed.map((l) => l.variantId)), costLookup: "ok" };
  } catch (error) {
    console.error("Report: cost lookup failed", error.message);
    return { costs: new Map(), costLookup: "unavailable" };
  }
}

/**
 * Outstanding payments: product lines of brands set to `terms` that are in a "still owed" status, whose supplier invoice is not marked paid,
 * on orders placed in the range. Cancelled orders and removed lines are left out. Cost comes from Shopify (blank if it cannot be read).
 */
async function buildOutstanding({ db, graphql, shop, range, terms }) {
  const brands = (await db.brandTerms.findMany({ where: { shop, terms } })).map((b) => b.brand);
  const empty = { csv: outstandingCsv([]), count: 0, capped: false, brands: brands.length, costLookup: "not_needed" };
  if (brands.length === 0) return empty;

  const { owed, byOrder, capped } = await owedLines(db, shop, {
    vendor: { in: brands }, lineStatusId: { in: OUTSTANDING_STATUS_IDS[terms] }, orderCreatedAt: { gte: range.gte, lte: range.lte },
  });
  if (owed.length === 0) return { ...empty, capped };
  const { costs, costLookup } = await costsFor(graphql, owed);
  const rows = owed.map((l) =>
    outstandingRow(l, {
      orderName: byOrder.get(l.orderId).name, orderCreatedAt: l.orderCreatedAt, statusLabel: statusLabels.get(l.lineStatusId) ?? null,
      costMinor: costs.get(l.variantId)?.costMinor ?? null,
    }),
  );
  return { csv: outstandingCsv(rows), count: rows.length, capped, brands: brands.length, costLookup };
}

/**
 * Outstanding In-Stock Items and Unpaid Invoices: lines that have been in stock (a stock date, or now DHD with Supplier), supplier invoice not
 * marked paid, not "Clearance" items, ordered in the range, in the statuses of that report (see STOCK_REPORTS). All brands.
 */
async function buildStockReport({ db, graphql, shop, range, kind }) {
  const { owed, byOrder, capped } = await owedLines(db, shop, {
    lineStatusId: STOCK_REPORTS[kind].statusFilter,
    orderCreatedAt: { gte: range.gte, lte: range.lte },
    NOT: { title: { contains: "clearance", mode: "insensitive" } },
    OR: [{ stockedDate: { not: null } }, { lineStatusId: DHD_WITH_SUPPLIER }],
  });
  if (owed.length === 0) return { csv: stockCsv([]), count: 0, capped, costLookup: "not_needed" };
  const { costs, costLookup } = await costsFor(graphql, owed);
  const rows = owed.map((l) =>
    stockRow(l, {
      orderName: byOrder.get(l.orderId).name, orderCreatedAt: l.orderCreatedAt, statusLabel: statusLabels.get(l.lineStatusId) ?? null,
      costMinor: costs.get(l.variantId)?.costMinor ?? null,
    }),
  );
  return { csv: stockCsv(rows), count: rows.length, capped, costLookup };
}

/**
 * { csv, count, capped }. kind "xero" needs range { gte, lte } (orders placed in it, cancelled ones left out);
 * kind "delivery" takes every order whose product lines are ready for delivery, with nothing owed;
 * kind "outstanding" needs range and terms ("credit" or "proforma") and `graphql` for item costs;
 * kind "instock" and "unpaid" need range and `graphql`.
 */
export async function buildReport({ db, graphql, shop, kind, range, terms }) {
  if (kind === "brandterms") {
    const rows = await listBrandTerms(db, shop);
    return { csv: brandTermsCsv(rows), count: rows.length, capped: false };
  }
  if (kind === "freestocksample") return { csv: freeStockSampleCsv(), count: 1, capped: false };
  if (kind === "freestock") {
    const rows = await allFreeStock(db, shop);
    return { csv: freeStockCsv(rows), count: rows.length, capped: false };
  }
  if (kind === "outstanding") return buildOutstanding({ db, graphql, shop, range, terms });
  if (Object.hasOwn(STOCK_REPORTS, kind)) return buildStockReport({ db, graphql, shop, range, kind });
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
