// Minerva Supplier Orders. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface MinervaRow { brand: string; applicableMinor: number; notApplicableMinor: number; discHundredths: number; amountMinor: number; notEligibleMinor: number; lines: number }
export interface MinervaBrand { brand: string; discHundredths: number; fromDate: string; toDate: string; updatedByName: string | null }
export interface MinervaData { rows: MinervaRow[]; brands: MinervaBrand[]; allBrands: string[] }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

const dateQuery = (from: string, to: string) => {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  return q;
};

export async function loadMinerva(from: string, to: string, fetchFn: typeof fetch = fetch): Promise<Result<MinervaData>> {
  try {
    const res = await callBackendResult(`/api/minerva?${dateQuery(from, to)}`, undefined, fetchFn);
    const b = res.body as (MinervaData & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as MinervaData } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function post(body: object, fetchFn: typeof fetch): Promise<Result<null>> {
  try {
    const res = await callBackendResult('/api/minerva', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    return res.ok ? { ok: true, data: null } : { ok: false, message: explain(res.status, res.body as Body | null) };
  } catch (e) {
    return failure(e);
  }
}
export const saveMinervaBrand = (brand: string, disc: string, from: string, to: string, fetchFn: typeof fetch = fetch) => post({ op: 'save', brand, disc, from, to }, fetchFn);
export const removeMinervaBrand = (brand: string, fetchFn: typeof fetch = fetch) => post({ op: 'delete', brand }, fetchFn);

/** A five-minute download link for the report with these dates. */
export async function minervaLink(from: string, to: string, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = dateQuery(from, to);
    q.set('kind', 'minerva');
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** 250 -> "2.5" */
export const discText = (h: number) => String(h / 100);
const dmy = (d: string) => (d ? d.split('-').reverse().join('/') : '');
export const periodText = (b: { fromDate: string; toDate: string }) => `${dmy(b.fromDate)} to ${dmy(b.toDate)}`;
