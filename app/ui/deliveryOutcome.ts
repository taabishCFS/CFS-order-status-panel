// The Completed Delivery and Failed Delivery/Collection pages. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type OutcomeKind = 'completed' | 'failed';
export interface OutcomeRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; email: string; brand: string; product: string; code: string; quantity: number;
  date: string | null; van: string; driver: string; reason: string; postcode: string; deliveryType: string; payMode: string; amountMinor: number; lineStatusId: number | null; statusLabel: string;
}
export interface OutcomeList { rows: OutcomeRow[]; total: number; page: number; pageCount: number; size: number; vans: { id: string; name: string }[]; payModes: string[]; brands: string[] }
export interface OutcomeFilter { kind: OutcomeKind; q: string; brand: string; van: string; pay: string; from: string; to: string; page: number; all: boolean }

export const PARTNER_OPTIONS = ['TNT', 'Pallet', 'Fur Deco', 'Graham Scotland', 'Graham Devon'];
export const TITLES: Record<OutcomeKind, string> = { completed: 'Delivery Completed', failed: 'Failed Delivery / Collection' };

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

function query(f: OutcomeFilter): URLSearchParams {
  const q = new URLSearchParams({ kind: f.kind });
  for (const k of ['q', 'brand', 'van', 'pay', 'from', 'to'] as const) if (f[k]) q.set(k, f[k]);
  return q;
}

export async function loadOutcome(f: OutcomeFilter, fetchFn: typeof fetch = fetch): Promise<Result<OutcomeList>> {
  try {
    const q = query(f);
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/delivery-outcome?${q}`, undefined, fetchFn);
    const b = res.body as (OutcomeList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as OutcomeList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute download link for everything the filters match (all pages). */
export async function outcomeLink(f: OutcomeFilter, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = query(f);
    q.set('kind', `outcome-${f.kind}`);
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
export const dmy = (iso: string | null): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
