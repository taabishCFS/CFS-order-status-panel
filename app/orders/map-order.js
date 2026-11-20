// Turns a Shopify GraphQL order into plain rows. Money is kept in minor units (pence) with its currency.
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

export function mapOrder(shop, o) {
  const tags = o.tags ?? [];
  const order = {
    shop,
    orderId: o.id,
    name: o.name,
    createdAt: new Date(o.createdAt),
    cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
    shopifyUpdatedAt: new Date(o.updatedAt),
    customerName: o.shippingAddress?.name ?? o.billingAddress?.name ?? null,
    email: o.email ?? null,
    shippingAddress: o.shippingAddress ?? null,
    billingAddress: o.billingAddress ?? null,
    financialStatus: o.displayFinancialStatus ?? null,
    subtotal: money(o.subtotalPriceSet),
    discount: money(o.totalDiscountsSet),
    shipping: money(o.totalShippingPriceSet),
    total: money(o.totalPriceSet),
    tags,
    sourceName: o.sourceName ?? null,
    site: siteOf({ sourceName: o.sourceName, tags }),
  };
  const lines = (o.lineItems?.nodes ?? []).map((l) => ({
    shop,
    orderId: o.id,
    lineId: l.id,
    sku: l.sku ?? null,
    vendor: l.vendor ?? null,
    variantTitle: l.variantTitle ?? null,
    title: l.title,
    quantity: l.quantity,
    price: money(l.originalUnitPriceSet),
    discount: money(l.totalDiscountSet),
    properties: (l.customAttributes ?? []).map(({ key, value }) => ({ key, value })),
  }));
  return { order, lines };
}
