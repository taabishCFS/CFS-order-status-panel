// Turns a Shopify GraphQL order into plain rows. Money is kept in minor units (pence) with its currency.
import { readStatusState } from "./status-state.js";

const SITES = ["CFS", "TFS", "FURN", "UD", "MM", "eBay"];

export const toMinor = (amount) => Math.round(Number(amount) * 100);

const money = (set) => ({ minor: toMinor(set?.shopMoney?.amount ?? 0), currency: set?.shopMoney?.currencyCode ?? "GBP" });

// Placeholder rule until the real site mapping is known: a `site:<X>` tag wins, an eBay source means eBay.
export function siteOf({ sourceName, tags }) {
  for (const tag of tags ?? []) {
    const match = /^site:(.+)$/i.exec(tag.trim());
    const site = match && SITES.find((s) => s.toLowerCase() === match[1].trim().toLowerCase());
    if (site) return site;
  }
  return /ebay/i.test(sourceName ?? "") ? "eBay" : null;
}

// A `<prefix>:<value>` tag, for fields Shopify has no column for (placeholder rule, like siteOf).
const tagValue = (tags, prefix) => {
  for (const tag of tags) {
    const m = new RegExp(`^${prefix}:(.+)$`, "i").exec(tag.trim());
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
};

export function mapOrder(shop, o) {
  const tags = o.tags ?? [];
  const status = readStatusState(o.metafield?.value ?? null);
  const createdAt = new Date(o.createdAt);
  // Delivery service charges (Update Delivery & Services) are custom lines marked [svc:...], and configuration price differences
  // are custom lines marked [cfg:...]; neither is a product, so neither is a line on the order lists.
  // Lines removed in an order edit stay on the Shopify order with a current quantity of 0; they are not on the order any more.
  const lineNodes = (o.lineItems?.nodes ?? []).filter((l) => l.currentQuantity !== 0 && !/\[(svc:[a-z_]+|cfg:\d+:v\d+)\]/.test(l.title ?? ""));
  const brandOf = (l) => l.vendor?.trim() || "Unmapped";
  // Each delivery service charge (and the reschedule charge) in pence, from its [svc:...] line, for Order Reports.
  const serviceMinor = {};
  for (const l of o.lineItems?.nodes ?? []) {
    const key = /\[svc:([a-z_]+)\]/.exec(l.title ?? "")?.[1];
    const qty = l.currentQuantity ?? l.quantity ?? 0;
    if (!key || qty <= 0) continue;
    serviceMinor[key] = (serviceMinor[key] ?? 0) + toMinor(l.originalUnitPriceSet?.shopMoney?.amount ?? 0) * qty;
  }
  const order = {
    shop,
    orderId: o.id,
    name: o.name,
    createdAt,
    cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
    shopifyUpdatedAt: new Date(o.updatedAt),
    customerName: o.shippingAddress?.name ?? o.billingAddress?.name ?? null,
    email: o.email ?? null,
    shippingAddress: o.shippingAddress ?? null,
    billingAddress: o.billingAddress ?? null,
    financialStatus: o.displayFinancialStatus ?? null,
    // The "current" amounts follow order edits (added or removed lines); the plain ones are what the order was placed at.
    subtotal: money(o.currentSubtotalPriceSet ?? o.subtotalPriceSet),
    discount: money(o.currentTotalDiscountsSet ?? o.totalDiscountsSet),
    shipping: money(o.currentShippingPriceSet ?? o.totalShippingPriceSet),
    total: money(o.currentTotalPriceSet ?? o.totalPriceSet),
    tags,
    sourceName: o.sourceName ?? null,
    site: siteOf({ sourceName: o.sourceName, tags }),
    orderStatusId: status.orderStatusId,
    gateway: o.paymentGatewayNames?.[0] ?? null,
    outstanding: money(o.totalOutstandingSet),
    refunded: money(o.totalRefundedSet),
    phone: o.shippingAddress?.phone ?? o.phone ?? null,
    postcode: o.shippingAddress?.zip ?? null,
    orderTakenBy: tagValue(tags, "taken-by"),
    orderSource: tagValue(tags, "source"),
    brands: [...new Set(lineNodes.map(brandOf))],
    lineStatusIds: [...new Set(lineNodes.map((l) => status.lines[l.id]?.statusId).filter((id) => id != null))],
    discountCodes: o.discountCodes ?? [],
    serviceMinor,
  };
  const lines = lineNodes.map((l) => ({
    shop,
    orderId: o.id,
    lineId: l.id,
    sku: l.sku ?? null,
    vendor: l.vendor ?? null,
    variantTitle: l.variantTitle ?? null,
    productId: l.product?.id ?? null,
    variantId: l.variant?.id ?? null,
    title: l.title,
    quantity: l.quantity,
    price: money(l.originalUnitPriceSet),
    discount: money(l.totalDiscountSet),
    properties: (l.customAttributes ?? []).map(({ key, value }) => ({ key, value })),
    lineStatusId: status.lines[l.id]?.statusId ?? null,
    expectedDate: status.lines[l.id]?.expectedDate ?? null,
    deliveryOutcome: status.lines[l.id]?.delivery ?? null,
    stockedDate: status.lines[l.id]?.stockedDate ?? null,
    cancelReason: status.lines[l.id]?.cancelReason ?? null,
    orderCreatedAt: createdAt,
  }));
  return { order, lines };
}
