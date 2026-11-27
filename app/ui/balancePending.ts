// The Balance Pending page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface PendingRow {
  orderId: string; orderName: string; orderDate: string; customer: string; email: string; postcode: string; payment: string;
  totalMinor: number; paidMinor: number; balanceMinor: number; refund: 'full' | 'part' | null; statuses: (number | null)[];
}
export interface PendingList { rows: PendingRow[]; total: number; page: number; pageCount: number; size: number; balanceMinor: number; paidMinor: number }
export interface PendingQuery { page: number; all: boolean; status: number; q: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export function pendingSearch({ page, all, status, q }: PendingQuery): string {
  const s = new URLSearchParams();
  if (all) s.set('all', '1');
  else if (page > 1) s.set('page', String(page));
  if (status) s.set('status', String(status));
  if (q.trim()) s.set('q', q.trim());
  return s.toString();
}

export async function loadPending(query: PendingQuery, fetchFn: typeof fetch = fetch): Promise<Result<PendingList>> {
  try {
    const res = await callBackendResult(`/api/balance-pending?${pendingSearch(query)}`, undefined, fetchFn);
    const b = res.body as (PendingList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as PendingList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function link(path: string, fetchFn: typeof fetch): Promise<Result<{ url: string }>> {
  try {
    const res = await callBackendResult(path, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute link to the file of the ticked orders (the numbers at the end of their IDs). */
export const pendingLink = (orderIds: string[], status: number, fetchFn: typeof fetch = fetch) =>
  link(`/api/delivery-export?kind=balance-pending&ids=${orderIds.map((g) => g.split('/').pop()).join(',')}${status ? `&status=${status}` : ''}`, fetchFn);

/** A five-minute link to Download All: every line of every order that owes money. */
export const pendingAllLink = (fetchFn: typeof fetch = fetch) => link('/api/delivery-export?kind=balance-pending-all', fetchFn);
