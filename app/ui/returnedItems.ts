// The Returned Items page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface ReturnedRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; product: string; variantTitle: string | null; sku: string; quantity: number;
  brand: string; reason: string; statusId: number; action: string | null; actionLabel: string; actionBy: string | null; actionAt: string | null;
}
export interface ReturnedList { rows: ReturnedRow[]; total: number; page: number; pageCount: number; size: number }

// The old page's Return Action choices (the values match the server's).
export const RETURN_ACTIONS = [
  { value: 'ReturnBackToSupplier', label: 'Return Back To Supplier' },
  { value: 'DamageReturn', label: 'Damage Return' },
  { value: 'Clearance', label: 'Clearance' },
  { value: 'Dispose', label: 'Dispose' },
  { value: 'FreeStock', label: 'Free Stock' },
];

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const MESSAGES: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can mark returned items.',
  bad_action: 'Choose a return action first.',
  bad_request: 'Tick at least one item (up to 500 at a time).',
};
const explain = (status: number, body: { error?: string; message?: string } | null) =>
  (body?.error && MESSAGES[body.error]) || body?.message || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export function returnedQuery(page: number, q: string): string {
  const s = new URLSearchParams();
  if (page > 1) s.set('page', String(page));
  if (q.trim()) s.set('q', q.trim());
  return s.toString();
}

export async function loadReturned(page: number, q: string, fetchFn: typeof fetch = fetch): Promise<Result<ReturnedList>> {
  try {
    const res = await callBackendResult(`/api/returned-items?${returnedQuery(page, q)}`, undefined, fetchFn);
    const b = res.body as (ReturnedList & { error?: string; message?: string }) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as ReturnedList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export async function markReturned(lineIds: string[], action: string, fetchFn: typeof fetch = fetch): Promise<Result<{ marked: number; skipped: number }>> {
  try {
    const res = await callBackendResult('/api/returned-items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lineIds, action }) }, fetchFn);
    const b = res.body as { marked?: number; skipped?: number; error?: string; message?: string } | null;
    return res.ok && typeof b?.marked === 'number' ? { ok: true, data: { marked: b.marked, skipped: b.skipped ?? 0 } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
