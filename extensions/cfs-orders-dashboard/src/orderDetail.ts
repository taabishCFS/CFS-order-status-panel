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
  final: Money | null;
}

export interface OrderDetail {
  id: string;
  name: string;
  createdAt: string;
  lines: DetailLine[];
  totals: { subtotal: Money | null; discounts: Money | null; shipping: Money | null; total: Money | null };
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
      lineItems(first: 100) {
        nodes {
          id title variantTitle sku vendor quantity currentQuantity
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          discountAllocations { allocatedAmountSet { shopMoney { amount currencyCode } } }
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
  discountAllocations?: { allocatedAmountSet: MoneySet }[];
}

function toDetailLine(l: RawLine): DetailLine {
  const unit = asMoney(l.originalUnitPriceSet);
  // Discount allocations cover the quantity first ordered. After an edit that changed the quantity
  // they would be wrong, so those lines show no discount or final price rather than a wrong one.
  const edited = l.quantity !== l.currentQuantity;
  let discount: Money | null = null;
  let final: Money | null = null;
  if (unit && !edited) {
    const m = lineMoney(unit.amount, l.currentQuantity, (l.discountAllocations ?? []).map((a) => a.allocatedAmountSet?.shopMoney.amount ?? '0'), unit.currency);
    discount = m.discount;
    final = m.final;
  }
  return { id: l.id, title: l.title, variantTitle: l.variantTitle, sku: l.sku, vendor: l.vendor, quantity: l.currentQuantity, unit, discount, final };
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
    lines: (o.lineItems.nodes as RawLine[]).filter((l) => l.currentQuantity > 0).map(toDetailLine),
    totals: {
      subtotal: asMoney(o.currentSubtotalPriceSet),
      discounts: asMoney(o.currentTotalDiscountsSet),
      shipping: asMoney(o.currentShippingPriceSet),
      total: asMoney(o.currentTotalPriceSet),
    },
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
