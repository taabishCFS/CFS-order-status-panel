// Pure display helpers shared by the order lists.
import type { LineRow, PayType } from './listApi';

export type PageItem = number | 'next' | 'all';

// A window of five page numbers around the current page, then Next (unless on the last page) and All.
export function pageItems(page: number, pageCount: number): PageItem[] {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const items: PageItem[] = [];
  for (let n = start; n <= Math.min(pageCount, start + 4); n += 1) items.push(n);
  if (page < pageCount) items.push('next');
  items.push('all');
  return items;
}

const PAY_TYPES: Record<PayType, string> = { paid: 'Fully paid', partial: 'Partially paid', awaiting: 'Awaiting payment', failed: 'Payment failed' };
export const payTypeLabel = (t: PayType): string => PAY_TYPES[t];

const GATEWAYS: Record<string, string> = {
  kody: 'KODY',
  ryft: 'RYFT',
  revolut: 'REVOLUT',
  paypal: 'PAYPAL',
  paypal_express_checkout: 'PAYPAL EXPRESS',
  shopify_payments: 'SHOPIFY',
  bank_transfer: 'BANK TRANSFER',
  manual: 'MANUAL',
};
export const gatewayLabel = (gateway: string | null): string => (gateway ? GATEWAYS[gateway] ?? gateway.replace(/_/g, ' ').toUpperCase() : 'Unknown');

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export function formatMoney(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency === 'GBP' ? `£${amount}` : `${currency} ${amount}`;
}

const TONES: Record<number, 'warning' | 'success' | 'critical'> = { 1: 'warning', 4: 'success', 7: 'critical', 32: 'critical', 50: 'critical' };
export const statusTone = (id: number): 'warning' | 'success' | 'critical' | 'neutral' => TONES[id] ?? 'neutral';

export const lineTitle = (brand: string, count: number): string => (brand ? `Orders By Brand : ${brand} : (${count})` : `Orders By Brand : (${count})`);

// "Find in loaded lines": order number, product or code, any case. Empty text matches everything.
export function matchesFind(row: LineRow, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return [row.orderName, row.product, row.sku ?? ''].some((v) => v.toLowerCase().includes(needle));
}

export function toggleOne(selected: Set<string>, lineId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(lineId)) next.delete(lineId);
  else next.add(lineId);
  return next;
}

export function toggleAll(selected: Set<string>, rows: LineRow[]): Set<string> {
  return rows.length > 0 && rows.every((r) => selected.has(r.lineId)) ? new Set() : new Set(rows.map((r) => r.lineId));
}

// "1 - 50 Records Of 120". With All, the range is the whole list.
export function rangeText(page: number, size: number, total: number, all: boolean): string {
  if (total === 0) return '0 Records';
  const first = all ? 1 : (page - 1) * size + 1;
  const last = all ? total : Math.min(page * size, total);
  return `${first} - ${last} Records Of ${total}`;
}

/** The out-of-stock badge for a line: yellow tint = warning with the due date, red tint = critical. Null when the line is not tinted. */
export function stockBadge(row: { stockTint?: 'yellow' | 'red' | null; stockDueDate?: string | null }): { tone: 'warning' | 'critical'; text: string } | null {
  if (row.stockTint === 'yellow' && row.stockDueDate) {
    const [y, m, d] = row.stockDueDate.split('-');
    return { tone: 'warning', text: `Out of stock · due ${d}/${m}/${y}` };
  }
  if (row.stockTint === 'red') return { tone: 'critical', text: 'Out of stock · no due date' };
  return null;
}
