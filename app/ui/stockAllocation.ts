// Giving free stock to an order's lines, and taking it back. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

/** Which stock an order screen is working with: the free stock list or the container list. */
export type StockKind = 'free' | 'container';
const SUFFIX: Record<StockKind, string> = { free: 'stock', container: 'container' };

export interface StockOption {
  id: string;
  containerNo?: string; // container stock only
  expectedDate?: string; // container stock only, "" when none
  onWater?: boolean; // container stock only
  brand: string;
  productName: string;
  productCode: string;
  warehouseCode: string;
  qty: number;
  cost: string;
}

export interface GivenStock {
  id: string;
  containerNo?: string; // container stock only
  lineId: string;
  qty: number;
  unitCost: string;
  addedByName: string | null;
  createdAt: string;
  brand: string;
  productName: string;
  productCode: string;
  warehouseCode: string;
}

export interface OrderStock {
  allocations: GivenStock[];
  options: Record<string, StockOption[]>;
}

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can give out stock.',
  bad_request: 'Enter a whole number of 1 or more.',
  no_line: 'This item is not on the order any more. Refresh the page.',
  no_stock: 'That stock item no longer exists. Refresh the page.',
  not_found: 'That allocation no longer exists. Refresh the page.',
  no_match: 'That stock is a different product from this item.',
  not_enough: 'There is not enough of that stock left. Someone may have just used it. Refresh the page.',
  too_many_for_line: 'That is more than this item ordered, counting what it already has.',
};
const explain = (status: number, body: { error?: string } | null) => (body?.error && EXPLAIN[body.error]) || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadOrderStock(orderNumber: string, fetchFn: typeof fetch = fetch, kind: StockKind = 'free'): Promise<{ ok: true; data: OrderStock } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/${SUFFIX[kind]}`, undefined, fetchFn);
    const body = res.body as (Partial<OrderStock> & { error?: string }) | null;
    return res.ok && Array.isArray(body?.allocations) && body?.options ? { ok: true, data: { allocations: body.allocations, options: body.options } } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

async function post(orderNumber: string, payload: unknown, fetchFn: typeof fetch, kind: StockKind): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/${SUFFIX[kind]}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, fetchFn);
    const body = res.body as { ok?: boolean; error?: string } | null;
    return res.ok && body?.ok ? { ok: true } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export const allocateStock = (orderNumber: string, lineId: string, stockId: string, qty: number, fetchFn: typeof fetch = fetch, kind: StockKind = 'free') =>
  post(orderNumber, kind === 'free' ? { action: 'allocate', lineId, freeStockId: stockId, qty } : { action: 'allocate', lineId, stockId, qty }, fetchFn, kind);

export const removeAllocation = (orderNumber: string, allocationId: string, fetchFn: typeof fetch = fetch, kind: StockKind = 'free') => post(orderNumber, { action: 'remove', allocationId }, fetchFn, kind);

/** The most of an option a line can be given: what is left in stock, and what the line still needs (ordered minus already given). */
export const mostToGive = (option: StockOption, ordered: number, alreadyGiven: number): number => Math.max(0, Math.min(option.qty, ordered - alreadyGiven));

/** The quantity typed as a whole number from 1, or null when it is not one. */
export function wholeQty(text: string): number | null {
  const t = text.trim();
  return /^\d{1,6}$/.test(t) && Number(t) >= 1 ? Number(t) : null;
}

export const givenToLine = (allocations: GivenStock[], lineId: string): GivenStock[] => allocations.filter((a) => a.lineId === lineId);
export const countGiven = (allocations: GivenStock[], lineId: string): number => givenToLine(allocations, lineId).reduce((sum, a) => sum + a.qty, 0);
