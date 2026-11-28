// Saves one mapped order and its lines. Safe to repeat; an older copy never replaces a newer one.
const LIMITS = { maxWait: 10000, timeout: 20000 };

const json = (value) => (value == null ? null : JSON.stringify(value));

function orderColumns(o) {
  return {
    shop: o.shop,
    orderId: o.orderId,
    name: o.name,
    createdAt: o.createdAt,
    cancelledAt: o.cancelledAt,
    shopifyUpdatedAt: o.shopifyUpdatedAt,
    customerName: o.customerName,
    email: o.email,
    shippingAddress: json(o.shippingAddress),
    billingAddress: json(o.billingAddress),
    financialStatus: o.financialStatus,
    currency: o.total.currency,
    subtotalMinor: o.subtotal.minor,
    discountMinor: o.discount.minor,
    shippingMinor: o.shipping.minor,
    totalMinor: o.total.minor,
    tags: o.tags,
    sourceName: o.sourceName,
    site: o.site,
    orderStatusId: o.orderStatusId,
    gateway: o.gateway,
    outstandingMinor: o.outstanding.minor,
    refundedMinor: o.refunded.minor,
    phone: o.phone,
    postcode: o.postcode,
    orderTakenBy: o.orderTakenBy,
    orderSource: o.orderSource,
    brands: o.brands,
    lineStatusIds: o.lineStatusIds,
    discountCodes: o.discountCodes ?? [],
    serviceMinor: o.serviceMinor ?? {},
  };
}

const lineColumns = (l, archived) => ({
  shop: l.shop,
  orderId: l.orderId,
  lineId: l.lineId,
  sku: l.sku,
  vendor: l.vendor,
  variantTitle: l.variantTitle,
  productId: l.productId,
  variantId: l.variantId,
  title: l.title,
  quantity: l.quantity,
  currency: l.price.currency,
  priceMinor: l.price.minor,
  discountMinor: l.discount.minor,
  properties: l.properties,
  lineStatusId: l.lineStatusId,
  expectedDate: l.expectedDate,
  deliveryOutcome: l.deliveryOutcome,
  stockedDate: l.stockedDate,
  cancelReason: l.cancelReason ?? null,
  completedDate: l.completedDate ?? null,
  orderCreatedAt: l.orderCreatedAt,
  orderArchived: archived,
});

/** Returns { outcome: "saved" | "stale" }. Throws when the database fails, so the caller can retry. */
export async function upsertOrder(db, { order, lines }) {
  return db.$transaction(async (tx) => {
    const where = { shop_orderId: { shop: order.shop, orderId: order.orderId } };
    const existing = await tx.order.findUnique({ where });
    if (existing && existing.shopifyUpdatedAt > order.shopifyUpdatedAt) return { outcome: "stale" };
    const data = orderColumns(order);
    await tx.order.upsert({ where, create: data, update: data });
    await tx.orderLine.deleteMany({ where: { shop: order.shop, orderId: order.orderId } });
    if (lines.length) await tx.orderLine.createMany({ data: lines.map((l) => lineColumns(l, existing?.archivedAt != null)) });
    return { outcome: "saved" };
  }, LIMITS);
}
