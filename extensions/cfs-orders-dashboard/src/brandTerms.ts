// The Brand terms screen: whether each brand's supplier is paid on credit or pro-forma. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type Terms = 'credit' | 'proforma' | null;

export interface BrandTermsRow {
  brand: string;
  terms: Terms;
}

export const TERMS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'credit', label: 'Credit' },
  { value: 'proforma', label: 'Pro-forma' },
];

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change brand terms.',
  bad_request: 'That brand or setting is not valid.',
};
const explain = (status: number, body: { error?: string } | null) => (body?.error && EXPLAIN[body.error]) || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadBrandTerms(fetchFn: typeof fetch = fetch): Promise<{ ok: true; brands: BrandTermsRow[] } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/brand-terms', undefined, fetchFn);
    const body = res.body as { brands?: BrandTermsRow[]; error?: string } | null;
    return res.ok && Array.isArray(body?.brands) ? { ok: true, brands: body.brands } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function saveBrandTerms(brand: string, terms: Terms, fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/brand-terms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand, terms }) }, fetchFn);
    const body = res.body as { error?: string } | null;
    return res.ok ? { ok: true } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

/** The select's value ("" for none) as a Terms value. Anything unexpected counts as not set. */
export const termsFromValue = (value: string): Terms => (value === 'credit' || value === 'proforma' ? value : null);
