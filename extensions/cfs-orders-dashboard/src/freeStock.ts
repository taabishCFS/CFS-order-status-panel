// The Stock screen's free stock list: items we already own that can be given to an order. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type StockView = 'available' | 'used' | 'all';

export interface FreeStockItem {
  id: string;
  itemType: string;
  sourceOrder: string;
  brand: string;
  productName: string;
  qty: number;
  productCode: string;
  warehouseCode: string;
  rma: string;
  remarks: string;
  cost: string; // pounds as text, "" when not known
  creditFoc: string;
  status: string;
  collection: string;
  addedByName: string | null;
  allocatedTo: string[]; // orders it was given to, e.g. "#1038 x2"
}

export interface FreeStockPage {
  items: FreeStockItem[];
  total: number;
  page: number;
  pageCount: number;
  itemTypes: string[];
}

export interface FreeStockInput {
  brand: string;
  productName: string;
  productCode: string;
  qty: string;
  cost: string;
  sourceOrder: string;
  remarks: string;
}

export const VIEW_OPTIONS: { value: StockView; label: string }[] = [
  { value: 'available', label: 'In stock' },
  { value: 'used', label: 'Used up' },
  { value: 'all', label: 'All' },
];

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change stock.',
  too_many_rows: 'Please import at most 5000 rows at a time.',
  bad_request: 'That stock item could not be used.',
  not_found: 'That stock item no longer exists. Reload the page.',
  allocated: 'This item has been given to an order, so it cannot be deleted. Take it back from the order first.',
};
const explain = (status: number, body: { error?: string; message?: string } | null) => body?.message || (body?.error && EXPLAIN[body.error]) || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadFreeStock(
  params: { search?: string; view?: StockView; type?: string; page?: number },
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; data: FreeStockPage } | { ok: false; message: string }> {
  const q = new URLSearchParams();
  if (params.search?.trim()) q.set('search', params.search.trim());
  if (params.view) q.set('view', params.view);
  if (params.type) q.set('type', params.type);
  if (params.page && params.page > 1) q.set('page', String(params.page));
  try {
    const res = await callBackendResult(`/api/free-stock${q.toString() ? `?${q}` : ''}`, undefined, fetchFn);
    const body = res.body as (Partial<FreeStockPage> & { error?: string }) | null;
    return res.ok && Array.isArray(body?.items) ? { ok: true, data: body as FreeStockPage } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function addFreeStock(item: FreeStockInput, fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/free-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item }) }, fetchFn);
    const body = res.body as { error?: string; message?: string } | null;
    return res.ok ? { ok: true } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

/** Every field of a stock record as the edit form holds it (all text). */
export interface FreeStockEdit extends FreeStockInput {
  itemType: string;
  warehouseCode: string;
  rma: string;
  creditFoc: string;
  status: string;
  collection: string;
}

/** The edit form's starting values for a listed item. */
export const editFrom = (it: FreeStockItem): FreeStockEdit => ({
  itemType: it.itemType, brand: it.brand, productName: it.productName, productCode: it.productCode, qty: String(it.qty), cost: it.cost,
  sourceOrder: it.sourceOrder, warehouseCode: it.warehouseCode, rma: it.rma, remarks: it.remarks, creditFoc: it.creditFoc, status: it.status, collection: it.collection,
});

/** Correct a stock record. Quantity 0 marks it used up. */
export async function updateFreeStock(id: string, item: FreeStockEdit, fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/free-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, item }) }, fetchFn);
    const body = res.body as { error?: string; message?: string } | null;
    return res.ok ? { ok: true } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

/** Delete a stock record for good. */
export async function deleteFreeStock(id: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/free-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, remove: true }) }, fetchFn);
    const body = res.body as { error?: string; message?: string } | null;
    return res.ok ? { ok: true } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

/** A blank form. */
export const emptyInput = (): FreeStockInput => ({ brand: '', productName: '', productCode: '', qty: '1', cost: '', sourceOrder: '', remarks: '' });

/** What is wrong with the form, or null when it can be saved. A quick check before asking the server. */
export function inputProblem(i: FreeStockInput, minQty = 1): string | null {
  if (!i.brand.trim()) return 'Enter the brand.';
  if (!i.productCode.trim()) return 'Enter the product code.';
  if (!/^\d+$/.test(i.qty.trim()) || Number(i.qty) < minQty) return `The quantity must be a whole number, ${minQty} or more.`;
  if (i.cost.trim() && !/^[£\s]*\d[\d,]*(\.\d{1,2})?\s*$/.test(i.cost)) return 'The cost must be an amount like 12.50.';
  return null;
}
