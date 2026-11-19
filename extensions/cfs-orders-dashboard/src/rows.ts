import { deliveryOf, expectedOf } from '../../cfs-order-status/src/lineInfo';
import type { Stamp, StatusState } from '../../cfs-order-status/src/types';

export const UNMAPPED_BRAND = 'Unmapped';

export interface LineNode {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  vendor: string | null;
  quantity: number;
  currentQuantity: number;
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
}

export interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  metafield: { value: string } | null;
  lineItems: { nodes: LineNode[] };
}

export interface StatusRef {
  id: number;
  label: string;
}

export interface Row {
  orderId: string;
  orderName: string;
  createdAt: string;
  lineId: string;
  brand: string;
  unmapped: boolean;
  product: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: { amount: string; currency: string } | null;
  lineStatus: StatusRef | null;
  orderStatus: StatusRef | null;
  expectedDate: string | null;
  delivery: 'confirmed' | 'declined' | null;
  statusUnreadable: boolean;
}

export interface Filters {
  brand?: string;
  statusId?: number | 'none';
  search?: string;
  noExpectedDate?: boolean;
}

const ref = (s: Stamp | null | undefined): StatusRef | null => (s ? { id: s.statusId, label: s.label } : null);

// A bad metafield must not hide the order's lines, so it reads as "no status" and is flagged.
function parseState(metafield: OrderNode['metafield']): { state: StatusState | null; unreadable: boolean } {
  if (!metafield) return { state: null, unreadable: false };
  try {
    const parsed = JSON.parse(metafield.value);
    const ok = parsed && typeof parsed === 'object' && parsed.lines && typeof parsed.lines === 'object' && !Array.isArray(parsed.lines);
    return ok ? { state: parsed as StatusState, unreadable: false } : { state: null, unreadable: true };
  } catch {
    return { state: null, unreadable: true };
  }
}

// One row per line still on the order. Lines removed in an order edit stay in Shopify
// with currentQuantity 0 and are not operational work, so they are left out.
export function buildRows(orders: OrderNode[]): Row[] {
  const rows: Row[] = [];
  for (const o of orders) {
    const { state, unreadable } = parseState(o.metafield);
    for (const l of o.lineItems.nodes) {
      if (l.currentQuantity <= 0) continue;
      const vendor = (l.vendor ?? '').trim();
      const price = l.originalUnitPriceSet?.shopMoney;
      rows.push({
        orderId: o.id,
        orderName: o.name,
        createdAt: o.createdAt,
        lineId: l.id,
        brand: vendor || UNMAPPED_BRAND,
        unmapped: !vendor,
        product: l.title,
        variantTitle: l.variantTitle,
        sku: l.sku,
        quantity: l.currentQuantity,
        unitPrice: price ? { amount: price.amount, currency: price.currencyCode } : null,
        lineStatus: ref(state?.lines?.[l.id]),
        orderStatus: ref(state?.order),
        expectedDate: state ? expectedOf(state, l.id) : null,
        delivery: state ? deliveryOf(state, l.id) : null,
        statusUnreadable: unreadable,
      });
    }
  }
  return rows;
}

export function filterRows(rows: Row[], f: Filters): Row[] {
  const q = f.search?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.brand && r.brand !== f.brand) return false;
    if (f.noExpectedDate && r.expectedDate) return false;
    if (f.statusId === 'none' && r.lineStatus) return false;
    if (typeof f.statusId === 'number' && r.lineStatus?.id !== f.statusId) return false;
    if (q) {
      const hay = [r.orderName, r.product, r.variantTitle, r.sku].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Counts always come from the rows passed in, i.e. the matched result set.
export function summarize(rows: Row[]) {
  return {
    lines: rows.length,
    orders: new Set(rows.map((r) => r.orderId)).size,
    units: rows.reduce((n, r) => n + r.quantity, 0),
  };
}

export function brandsOf(rows: Row[]): string[] {
  const set = new Set(rows.map((r) => r.brand));
  const named = [...set].filter((b) => b !== UNMAPPED_BRAND).sort((a, b) => a.localeCompare(b));
  return set.has(UNMAPPED_BRAND) ? [...named, UNMAPPED_BRAND] : named;
}
