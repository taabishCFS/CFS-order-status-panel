// Reschedule Delivery Orders. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface RescheduleRow { lineId: string; orderId: string; orderName: string; orderDate: string | null; title: string; variantTitle: string; brand: string; priceMinor: number; chargeMinor: number; count: number }
export interface RescheduleList { rows: RescheduleRow[]; total: number; page: number; pageCount: number; size: number; brands: string[] }
export interface RescheduleFilter { brand: string; from: string; to: string; q: string; page: number; all: boolean }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadReschedules(f: RescheduleFilter, fetchFn: typeof fetch = fetch): Promise<Result<RescheduleList>> {
  try {
    const q = new URLSearchParams();
    for (const k of ['brand', 'from', 'to', 'q'] as const) if (f[k]) q.set(k, f[k]);
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/reschedule-orders?${q}`, undefined, fetchFn);
    const b = res.body as (RescheduleList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as RescheduleList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute download link for the ticked lines. */
export async function rescheduleLink(lineIds: string[], fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = new URLSearchParams({ kind: 'reschedule-orders', lines: lineIds.join(',') });
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
