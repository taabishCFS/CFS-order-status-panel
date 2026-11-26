// The Instock Balance Due page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface BalanceRow { orderId: string; orderName: string; orderDate: string; customer: string; postcode: string; payment: string; totalMinor: number; balanceMinor: number; statuses: number[] }
export interface BalanceList { rows: BalanceRow[]; total: number; page: number; pageCount: number; size: number; balanceMinor: number }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadBalances(page: number, all: boolean, fetchFn: typeof fetch = fetch): Promise<Result<BalanceList>> {
  try {
    const q = new URLSearchParams();
    if (all) q.set('all', '1');
    else if (page > 1) q.set('page', String(page));
    const res = await callBackendResult(`/api/instock-balance?${q}`, undefined, fetchFn);
    const b = res.body as (BalanceList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as BalanceList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute download link for the ticked orders (the numbers at the end of their IDs). */
export async function balanceLink(orderIds: string[], fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const ids = orderIds.map((g) => g.split('/').pop()).join(',');
    const res = await callBackendResult(`/api/delivery-export?kind=instock-balance&ids=${ids}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
