// Test helpers: Shopify GraphQL order shapes and a tiny in-memory stand-in for the database.
const set = (amount, currencyCode = "GBP") => ({ shopMoney: { amount, currencyCode } });

export const gqlLine = (n = 1, over = {}) => ({
  id: `gid://shopify/LineItem/${n}`,
  title: `Item ${n}`,
  sku: `SKU-${n}`,
  vendor: "Duke Beds",
  variantTitle: "2ft 6in",
  product: { id: "gid://shopify/Product/500" },
  variant: { id: "gid://shopify/ProductVariant/600" },
  quantity: 1,
  originalUnitPriceSet: set("279.0"),
  totalDiscountSet: set("0.0"),
  customAttributes: [{ key: "Size", value: "2ft 6in" }],
  ...over,
});

export const gqlOrder = (over = {}) => ({
  id: "gid://shopify/Order/1",
  name: "#1036",
  createdAt: "2026-11-18T15:14:12Z",
  updatedAt: "2026-11-19T10:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  sourceName: "web",
  tags: ["site:CFS"],
  email: "a@example.com",
  shippingAddress: { name: "Alex Customer", address1: "12 High St", city: "Leicester", zip: "LE1 3LR", countryCode: "GB" },
  billingAddress: { address1: "12 High St", city: "Leicester", zip: "LE1 3LR", countryCode: "GB" },
  subtotalPriceSet: set("279.0"),
  totalDiscountsSet: set("0.0"),
  totalShippingPriceSet: set("20.0"),
  totalPriceSet: set("299.0"),
  paymentGatewayNames: ["shopify_payments"],
  phone: null,
  totalOutstandingSet: set("0.0"),
  totalRefundedSet: set("0.0"),
  metafield: null,
  lineItems: { nodes: [gqlLine(1)], pageInfo: { hasNextPage: false, endCursor: null } },
  ...over,
});

// Replies like admin.graphql: an object with json().
export const gqlReply = (body) => ({ json: async () => body });

// In-memory database with the few calls the mirror uses.
export function fakeDb() {
  const orders = new Map();
  let lines = [];
  const key = (w) => `${w.shop_orderId.shop}|${w.shop_orderId.orderId}`;
  const db = {
    orders,
    get lines() { return lines; },
    order: {
      findUnique: async ({ where }) => orders.get(key(where)) ?? null,
      upsert: async ({ where, create, update }) => {
        const existing = orders.get(key(where));
        orders.set(key(where), existing ? { ...existing, ...update } : create);
      },
    },
    orderLine: {
      deleteMany: async ({ where }) => { lines = lines.filter((l) => !(l.shop === where.shop && l.orderId === where.orderId)); },
      createMany: async ({ data }) => { lines = lines.concat(data); },
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}
