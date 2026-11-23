import { loadState } from '../../cfs-order-status/src/store';
import type { StatusState } from '../../cfs-order-status/src/types';

const ENDPOINT = 'shopify:admin/api/graphql.json';

export interface Money {
  amount: string;
  currency: string;
}

export interface DetailLine {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  vendor: string | null;
  quantity: number;
  unit: Money | null;
  discount: Money | null;
  offer: Money | null;
  coupon: Money | null;
  final: Money | null;
}

export interface Coupon {
  code: string;
  percent: number | null;
  amount: Money;
}

// The totals block as the legacy screen shows it: offer discount, coupons, delivery lines, paid and balance.
export interface Breakdown {
  offer: Money | null;
  adjustments: Money | null;
  coupons: Coupon[];
  delivery: { title: string; price: Money }[];
  paid: Money | null;
  balance: Money | null;
  refunded: Money | null;
}

export interface OrderDetail {
  id: string;
  name: string;
  createdAt: string;
  lines: DetailLine[];
  totals: { subtotal: Money | null; discounts: Money | null; shipping: Money | null; total: Money | null };
  breakdown: Breakdown;
  state: StatusState;
  digest: string | null;
}

// An address as the edit form holds it: every value is text, blank when Shopify has none.
export interface AddressFields {
  name: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  provinceCode: string;
  zip: string;
  country: string;
  countryCode: string;
  phone: string;
}

export interface OrderInfo {
  source: string | null;
  payment: string;
  ip: string | null;
  customerNote: string;
}

export type CustomerBlock =
  | { restricted: true }
  | {
      restricted: false;
      email: string | null;
      phone: string | null;
      shipping: string[];
      billing: string[];
      shippingFields: AddressFields | null;
      billingFields: AddressFields | null;
      info: OrderInfo;
    };

type MoneySet = { shopMoney: { amount: string; currencyCode: string } } | null | undefined;

// Money is handled in whole pence so 119.99 less 38.69 is exactly 81.30, never 81.30000000000001.
function toMinor(amount: string): number {
  const negative = amount.trim().startsWith('-');
  const [whole, frac = ''] = amount.trim().replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return negative ? -minor : minor;
}

function fromMinor(minor: number, currency: string): Money {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return { amount: `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`, currency };
}

export function lineMoney(unitAmount: string, quantity: number, allocationAmounts: string[], currency: string) {
  const gross = toMinor(unitAmount) * quantity;
  const discount = allocationAmounts.reduce((sum, a) => sum + toMinor(a), 0);
  return { gross: fromMinor(gross, currency), discount: fromMinor(discount, currency), final: fromMinor(gross - discount, currency) };
}

const asMoney = (set: MoneySet): Money | null =>
  set ? fromMinor(toMinor(set.shopMoney.amount), set.shopMoney.currencyCode) : null;

const DETAIL_QUERY = `#graphql
  query CfsOrderDetail($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      currentSubtotalPriceSet { shopMoney { amount currencyCode } }
      currentTotalDiscountsSet { shopMoney { amount currencyCode } }
      currentShippingPriceSet { shopMoney { amount currencyCode } }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      totalReceivedSet { shopMoney { amount currencyCode } }
      totalOutstandingSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      shippingLines(first: 5) { nodes { title originalPriceSet { shopMoney { amount currencyCode } } } }
      discountApplications(first: 20) {
        nodes {
          __typename
          targetType
          value { __typename ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount } }
          ... on DiscountCodeApplication { code }
          ... on AutomaticDiscountApplication { title }
          ... on ManualDiscountApplication { title }
        }
      }
      lineItems(first: 100) {
        nodes {
          id title variantTitle sku vendor quantity currentQuantity
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          discountAllocations { allocatedAmountSet { shopMoney { amount currencyCode } } discountApplication { index } }
        }
      }
    }
  }`;

async function post(fetchFn: typeof fetch, query: string, variables: unknown) {
  const res = await fetchFn(ENDPOINT, { method: 'POST', body: JSON.stringify({ query, variables }) });
  return res.json();
}

interface RawLine {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  vendor: string | null;
  quantity: number;
  currentQuantity: number;
  originalUnitPriceSet: MoneySet;
  discountAllocations?: { allocatedAmountSet: MoneySet; discountApplication?: { index: number } }[];
}

interface RawApplication {
  __typename: string;
  targetType?: string;
  code?: string;
  value?: { __typename: string; percentage?: number };
}

const SERVICE = /\s*\[svc:[a-z_]+\]/;

// Delivery service charges are order lines marked [svc:...]. They show as delivery rows in the totals, not as items.
function serviceCharges(lines: RawLine[]): { title: string; minor: number; currency: string }[] {
  const out: { title: string; minor: number; currency: string }[] = [];
  for (const l of lines) {
    const unit = asMoney(l.originalUnitPriceSet);
    if (l.currentQuantity > 0 && SERVICE.test(l.title) && unit) out.push({ title: l.title.replace(SERVICE, '').trim(), minor: toMinor(unit.amount) * l.currentQuantity, currency: unit.currency });
  }
  return out;
}

// Splits the order's line discounts by kind: automatic ones are the "offer", code ones are coupons,
// and manual ones (including price changes made here) are adjustments. Each amount is the sum of the
// allocations on the lines, added in whole pence.
export function breakdownOf(o: {
  discountApplications?: { nodes: RawApplication[] };
  lineItems: { nodes: RawLine[] };
  shippingLines?: { nodes: { title: string; originalPriceSet: MoneySet }[] };
  totalReceivedSet?: MoneySet;
  totalOutstandingSet?: MoneySet;
  totalRefundedSet?: MoneySet;
}): Breakdown {
  const apps = o.discountApplications?.nodes ?? [];
  const sums = new Map<number, number>();
  let currency = 'GBP';
  for (const line of o.lineItems.nodes) {
    for (const a of line.discountAllocations ?? []) {
      const index = a.discountApplication?.index;
      const set = a.allocatedAmountSet;
      if (index === undefined || !set) continue;
      currency = set.shopMoney.currencyCode;
      sums.set(index, (sums.get(index) ?? 0) + toMinor(set.shopMoney.amount));
    }
  }
  let offer = 0;
  let adjustments = 0;
  let hasOffer = false;
  let hasAdjustments = false;
  const coupons: Coupon[] = [];
  apps.forEach((app, index) => {
    if (app.targetType && app.targetType !== 'LINE_ITEM') return;
    const minor = sums.get(index) ?? 0;
    if (app.__typename === 'DiscountCodeApplication') {
      const percent = app.value?.__typename === 'PricingPercentageValue' ? app.value.percentage ?? null : null;
      coupons.push({ code: app.code ?? '', percent, amount: fromMinor(minor, currency) });
    } else if (app.__typename === 'AutomaticDiscountApplication') {
      offer += minor;
      hasOffer = true;
    } else {
      adjustments += minor;
      hasAdjustments = true;
    }
  });
  return {
    offer: hasOffer ? fromMinor(offer, currency) : null,
    adjustments: hasAdjustments ? fromMinor(adjustments, currency) : null,
    coupons,
    delivery: [
      ...(o.shippingLines?.nodes ?? []).map((s) => ({ title: s.title, price: asMoney(s.originalPriceSet) ?? fromMinor(0, currency) })),
      ...serviceCharges(o.lineItems.nodes).map((c) => ({ title: c.title, price: fromMinor(c.minor, c.currency) })),
    ],
    paid: asMoney(o.totalReceivedSet),
    balance: asMoney(o.totalOutstandingSet),
    refunded: asMoney(o.totalRefundedSet),
  };
}

function toDetailLine(l: RawLine, apps: RawApplication[] = []): DetailLine {
  const unit = asMoney(l.originalUnitPriceSet);
  // Discount allocations cover the quantity first ordered. After an edit that changed the quantity
  // they would be wrong, so those lines show no discount or final price rather than a wrong one.
  const edited = l.quantity !== l.currentQuantity;
  let discount: Money | null = null;
  let final: Money | null = null;
  let offer: Money | null = null;
  let coupon: Money | null = null;
  if (unit && !edited) {
    const part = (typename: string) =>
      fromMinor(
        (l.discountAllocations ?? []).reduce((sum, a) => (apps[a.discountApplication?.index ?? -1]?.__typename === typename ? sum + toMinor(a.allocatedAmountSet?.shopMoney.amount ?? '0') : sum), 0),
        unit.currency,
      );
    offer = part('AutomaticDiscountApplication');
    coupon = part('DiscountCodeApplication');
    const m = lineMoney(unit.amount, l.currentQuantity, (l.discountAllocations ?? []).map((a) => a.allocatedAmountSet?.shopMoney.amount ?? '0'), unit.currency);
    discount = m.discount;
    final = m.final;
  }
  return { id: l.id, title: l.title, variantTitle: l.variantTitle, sku: l.sku, vendor: l.vendor, quantity: l.currentQuantity, unit, discount, offer, coupon, final };
}

// Shopify's subtotal counts service charges as items; the legacy subtotal is products only.
function withoutServices(subtotal: Money | null, lines: RawLine[]): Money | null {
  if (!subtotal) return subtotal;
  const services = serviceCharges(lines).reduce((sum, c) => sum + c.minor, 0);
  return services ? fromMinor(toMinor(subtotal.amount) - services, subtotal.currency) : subtotal;
}

export async function loadOrderDetail(orderId: string, fetchFn: typeof fetch = fetch): Promise<OrderDetail> {
  const [{ state, digest }, body] = await Promise.all([
    loadState(orderId, fetchFn),
    post(fetchFn, DETAIL_QUERY, { id: orderId }),
  ]);
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('; '));
  const o = body.data.order;
  return {
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    lines: (o.lineItems.nodes as RawLine[]).filter((l) => l.currentQuantity > 0 && !/\[svc:[a-z_]+\]/.test(l.title)).map((l) => toDetailLine(l, o.discountApplications?.nodes ?? [])),
    totals: {
      subtotal: withoutServices(asMoney(o.currentSubtotalPriceSet), o.lineItems.nodes),
      discounts: asMoney(o.currentTotalDiscountsSet),
      shipping: asMoney(o.currentShippingPriceSet),
      total: asMoney(o.currentTotalPriceSet),
    },
    breakdown: breakdownOf(o),
    state,
    digest,
  };
}

const ADDRESS = 'name address1 address2 city province provinceCode zip country countryCodeV2 phone';
const CUSTOMER_QUERY = `#graphql
  query CfsOrderCustomer($id: ID!) {
    order(id: $id) {
      email
      phone
      note
      sourceName
      app { name }
      clientIp
      paymentGatewayNames
      customerJourneySummary { firstVisit { source } }
      shippingAddress { ${ADDRESS} }
      billingAddress { ${ADDRESS} }
    }
  }`;

const addressLines = (a: Record<string, string | null> | null): string[] =>
  a ? ['name', 'address1', 'address2', 'city', 'zip', 'country'].map((k) => a[k]).filter((v): v is string => !!v) : [];

function addressFields(a: Record<string, string | null> | null): AddressFields | null {
  if (!a) return null;
  const t = (k: string) => a[k] ?? '';
  return { name: t('name'), address1: t('address1'), address2: t('address2'), city: t('city'), province: t('province'), provinceCode: t('provinceCode'), zip: t('zip'), country: t('country'), countryCode: t('countryCodeV2'), phone: t('phone') };
}

// Customer details are protected data. Any refusal reads as "restricted"; nothing is logged or stored.
export async function loadCustomerBlock(orderId: string, fetchFn: typeof fetch = fetch): Promise<CustomerBlock> {
  try {
    const body = await post(fetchFn, CUSTOMER_QUERY, { id: orderId });
    if (body.errors?.length || !body.data?.order) return { restricted: true };
    const o = body.data.order;
    return {
      restricted: false,
      email: o.email ?? null,
      phone: o.phone || o.shippingAddress?.phone || o.billingAddress?.phone || null,
      shipping: addressLines(o.shippingAddress),
      billing: addressLines(o.billingAddress),
      shippingFields: addressFields(o.shippingAddress),
      billingFields: addressFields(o.billingAddress),
      info: {
        source: o.customerJourneySummary?.firstVisit?.source ?? (o.sourceName && !/^\d+$/.test(o.sourceName) ? o.sourceName : o.app?.name ?? null),
        payment: (o.paymentGatewayNames ?? []).join(', '),
        ip: o.clientIp ?? null,
        customerNote: o.note ?? '',
      },
    };
  } catch {
    return { restricted: true };
  }
}
