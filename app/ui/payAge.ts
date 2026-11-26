// The Proforma and Credit Payment Reports. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import type { PayRow } from './paySupplier';

export type PayTerms = 'proforma' | 'credit';
export interface PayAgeRow extends PayRow { invoiceMinor: number | null; invoiceVatMinor: number | null }
export interface PayAgeList { rows: PayAgeRow[]; total: number; page: number; pageCount: number; size: number; brands: string[]; brandTermsSet: boolean; costLookup: string }
export interface PayAgeFilter { terms: PayTerms; brand: string; from: string; to: string; page: number; all: boolean }
export const PAY_AGE_TITLES: Record<PayTerms, string> = { proforma: 'Proforma Payment Report', credit: 'Credit Payment Report' };

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

function query(f: PayAgeFilter): URLSearchParams {
  const q = new URLSearchParams({ terms: f.terms });
  for (const k of ['brand', 'from', 'to'] as const) if (f[k]) q.set(k, f[k]);
  return q;
}

export async function loadPayAge(f: PayAgeFilter, fetchFn: typeof fetch = fetch): Promise<Result<PayAgeList>> {
  try {
    const q = query(f);
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/pay-age?${q}`, undefined, fetchFn);
    const b = res.body as (PayAgeList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as PayAgeList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute download link for the ticked lines. */
export async function payAgeLink(f: PayAgeFilter, lineIds: string[], fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = query(f);
    q.set('kind', 'pay-age');
    q.set('lines', lineIds.join(','));
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
