// Reads the order and line lists (and archives orders) from our copy of Shopify's orders.
import { MAX_ALL_LINES, MAX_ALL_ORDERS, PAGE_SIZE, buildLineWhere, buildOrderWhere, payType, rowTone } from "./list-rules.js";

const EXCLUDED_FROM_REPEAT = [9, 32, 58, 50, 77];
const brandOf = (vendor) => vendor?.trim() || "Unmapped";

async function repeatCounts(db, shop, emails) {
  if (emails.length === 0) return new Map();
  const groups = await db.order.groupBy({
    by: ["email"],
    where: {
      shop,
      email: { in: emails },
      archivedAt: null,
      AND: [
        { NOT: { OR: [{ name: { startsWith: "R" } }, { name: { startsWith: "#R" } }] } },
        { OR: [{ orderStatusId: null }, { orderStatusId: { notIn: EXCLUDED_FROM_REPEAT } }] },
      ],
    },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.email, g._count._all]));
}

/** One page of orders: { rows, total, page, pageCount, capped }. */
export async function listOrders(db, shop, params) {
  const where = buildOrderWhere(shop, params);
  const total = await db.order.count({ where });
  const size = params.all ? MAX_ALL_ORDERS : PAGE_SIZE;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / size));
  const page = params.all ? 1 : Math.min(params.page, pageCount);
  const orders = await db.order.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size });
  const capped = params.all && total > MAX_ALL_ORDERS;
  if (orders.length === 0) return { rows: [], total, page, pageCount, capped };

  const emails = [...new Set(orders.map((o) => o.email).filter(Boolean))];
  const [lines, repeats] = await Promise.all([
    db.orderLine.findMany({ where: { shop, orderId: { in: orders.map((o) => o.orderId) } }, orderBy: { lineId: "asc" }, select: { orderId: true, lineId: true, lineStatusId: true } }),
    repeatCounts(db, shop, emails),
  ]);
  const statusesByOrder = new Map();
  for (const l of lines) statusesByOrder.set(l.orderId, [...(statusesByOrder.get(l.orderId) ?? []), l.lineStatusId]);

  const rows = orders.map((o) => ({
    orderId: o.orderId,
    name: o.name,
    createdAt: o.createdAt,
    site: o.site,
    customerName: o.customerName,
    email: o.email,
    gateway: o.gateway,
    totalMinor: o.totalMinor,
    currency: o.currency,
    payType: payType(o),
    tone: rowTone(o),
    orderStatusId: o.orderStatusId,
    lineStatuses: statusesByOrder.get(o.orderId) ?? [],
    orderTakenBy: o.orderTakenBy,
    orderSource: o.orderSource,
    repeatCustomer: (repeats.get(o.email) ?? 0) >= 2,
    archived: o.archivedAt != null,
  }));
  return { rows, total, page, pageCount, capped };
}

/** One page of lines for Orders by Brand: { rows, summary: { lines, orders, units }, total, page, pageCount, capped }. */
export async function listLines(db, shop, params) {
  const where = buildLineWhere(shop, params);
  const grouped = await db.orderLine.groupBy({ by: ["orderId"], where, _count: { _all: true }, _sum: { quantity: true } });
  const summary = {
    lines: grouped.reduce((n, g) => n + g._count._all, 0),
    orders: grouped.length,
    units: grouped.reduce((n, g) => n + (g._sum.quantity ?? 0), 0),
  };
  const size = params.all ? MAX_ALL_LINES : PAGE_SIZE;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(summary.lines / size));
  const page = params.all ? 1 : Math.min(params.page, pageCount);
  const stored = await db.orderLine.findMany({ where, orderBy: [{ orderCreatedAt: "desc" }, { lineId: "asc" }], skip: (page - 1) * size, take: size });
  const orderIds = [...new Set(stored.map((l) => l.orderId))];
  const orders = orderIds.length ? await db.order.findMany({ where: { shop, orderId: { in: orderIds } }, select: { orderId: true, name: true, site: true } }) : [];
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  const paidRows = stored.length ? await db.lineSupplierInvoice.findMany({ where: { shop, paid: true, lineId: { in: stored.map((l) => l.lineId) } }, select: { lineId: true } }) : [];
  const paid = new Set(paidRows.map((r) => r.lineId));
  const rows = stored.map((l) => ({
    lineId: l.lineId,
    orderId: l.orderId,
    orderName: byId.get(l.orderId)?.name ?? "",
    orderCreatedAt: l.orderCreatedAt,
    site: byId.get(l.orderId)?.site ?? null,
    brand: brandOf(l.vendor),
    product: l.title,
    variantTitle: l.variantTitle,
    sku: l.sku,
    quantity: l.quantity,
    priceMinor: l.priceMinor,
    currency: l.currency,
    lineStatusId: l.lineStatusId,
    expectedDate: l.expectedDate,
    deliveryOutcome: l.deliveryOutcome,
    supplierInvoicePaid: paid.has(l.lineId),
  }));
  return { rows, summary, total: summary.lines, page, pageCount, capped: params.all && summary.lines > MAX_ALL_LINES };
}

export async function listBrands(db, shop) {
  const vendors = await db.orderLine.findMany({ where: { shop }, distinct: ["vendor"], select: { vendor: true } });
  return [...new Set(vendors.map((v) => brandOf(v.vendor)))].sort((a, b) => a.localeCompare(b));
}

/** Archive (archived = true) or restore orders of this shop. Returns how many changed. */
export async function archiveOrders(db, shop, orderIds, archived) {
  return db.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { shop, orderId: { in: orderIds }, archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? new Date() : null },
    });
    await tx.orderLine.updateMany({ where: { shop, orderId: { in: orderIds } }, data: { orderArchived: archived } });
    return { count: result.count };
  });
}
