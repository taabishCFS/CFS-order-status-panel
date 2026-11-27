// The Pay To Supplier and Supplier Paid pages. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface PayRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; statusId: number | null; status: string; brand: string; title: string; variantTitle: string; code: string; quantity: number;
  calculatedMinor: number | null; manualMinor: number | null; dhdMinor: number | null; finalMinor: number | null; diffMinor: number | null; saleMinor: number;
  invoiceNumber: string; batchInvoiceNo: string; paidAt: string | null; stockedDate: string | null; paid: boolean;
}
export interface PayList { rows: PayRow[]; total: number; page: number; pageCount: number; size: number; brands: string[]; pageTotalMinor: number; costLookup: string }
export interface PayFilter { paid: boolean; brand: string; q: string; page: number; all: boolean }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const EXPLAIN: Record<string, string> = {
  bad_amount: 'Enter an amount like 12.50.',
  no_line: 'That line could not be found.',
  nothing_selected: 'Please Select Record(s) first.',
  no_permission: 'You do not have permission to pay suppliers.',
  staff_not_verified: 'Changing payments needs a verified Shopify staff sign-in.',
};
const explain = (status: number, body: Body | null): string => body?.message ?? (body?.error && EXPLAIN[body.error]) ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadPayable(f: PayFilter, fetchFn: typeof fetch = fetch): Promise<Result<PayList>> {
  try {
    const q = new URLSearchParams();
    if (f.paid) q.set('paid', '1');
    if (f.brand) q.set('brand', f.brand);
    if (f.q) q.set('q', f.q);
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/pay-supplier?${q}`, undefined, fetchFn);
    const b = res.body as (PayList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as PayList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function post(body: object, fetchFn: typeof fetch): Promise<Result<{ changed?: number }>> {
  try {
    const res = await callBackendResult('/api/pay-supplier', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    const b = res.body as ({ ok?: boolean; changed?: number } & Body) | null;
    return res.ok ? { ok: true, data: { changed: b?.changed } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
export const saveManualCost = (lineId: string, value: string, fetchFn: typeof fetch = fetch) => post({ op: 'manual', lineId, value }, fetchFn);
export const saveDhdCost = (lineId: string, value: string, fetchFn: typeof fetch = fetch) => post({ op: 'dhd', lineId, value }, fetchFn);
export const saveInvoiceNo = (lineId: string, value: string, fetchFn: typeof fetch = fetch) => post({ op: 'invoice', lineId, value }, fetchFn);
export const markPaid = (lineIds: string[], paid: boolean, fetchFn: typeof fetch = fetch) => post({ op: 'paid', lineIds, paid }, fetchFn);

/** A five-minute download link for the ticked lines. */
export async function payLink(lineIds: string[], fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const res = await callBackendResult(`/api/delivery-export?kind=pay-supplier&lines=${encodeURIComponent(lineIds.join(','))}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** Supplier Payments: the signed-in staff member's own list. */
export async function loadPayList(f: PayFilter, fetchFn: typeof fetch = fetch): Promise<Result<PayList>> {
  try {
    const q = new URLSearchParams();
    if (f.q) q.set('q', f.q);
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/pay-list?${q}`, undefined, fetchFn);
    const b = res.body as (PayList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as PayList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function postList(body: object, fetchFn: typeof fetch): Promise<Result<{ added?: number; already?: number; removed?: number }>> {
  try {
    const res = await callBackendResult('/api/pay-list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    const b = res.body as ({ added?: number; already?: number; removed?: number } & Body) | null;
    return res.ok ? { ok: true, data: { added: b?.added, already: b?.already, removed: b?.removed } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
export const addToPayList = (lineIds: string[], fetchFn: typeof fetch = fetch) => postList({ op: 'add', lineIds }, fetchFn);
export const removeFromPayList = (lineIds: string[], fetchFn: typeof fetch = fetch) => postList({ op: 'remove', lineIds }, fetchFn);

// Create Payment Batch & Draft Email (Pay To Supplier): one brand's ticked lines, the supplier's invoice number, a draft to review, then send.
export interface BatchLine { lineId: string; orderName: string; title: string; variantTitle: string; quantity: number; costMinor: number }
export interface BatchDraft { brand: string; recipients: string[]; lines: BatchLine[]; totalMinor: number; invoiceNo: string }
export interface BatchSent { brand: string; recipients: string[]; lines: number; totalMinor: number; invoiceNo: string; queued: number; duplicate: boolean }

async function postBatch<T>(body: object, fetchFn: typeof fetch): Promise<Result<T>> {
  try {
    const res = await callBackendResult('/api/payment-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    const b = res.body as (T & Body) | null;
    return res.ok && b ? { ok: true, data: b as T } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
export const draftBatch = (lineIds: string[], invoiceNo: string, fetchFn: typeof fetch = fetch) => postBatch<BatchDraft>({ op: 'draft', lineIds, invoiceNo }, fetchFn);
export const sendBatch = (lineIds: string[], invoiceNo: string, idempotencyKey: string, fetchFn: typeof fetch = fetch) => postBatch<BatchSent>({ op: 'send', lineIds, invoiceNo, idempotencyKey }, fetchFn);

/** A new suggested batch invoice number, CFSINV-<date and time>, like the old page's (which also had the brand number). */
export function suggestInvoiceNo(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `CFSINV-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}
