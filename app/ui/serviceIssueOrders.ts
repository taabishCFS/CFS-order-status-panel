// The Service Issue Orders page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface ServiceOrderRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; takenBy: string | null; product: string; sku: string | null;
  quantity: number; brand: string | null; statusId: number | null; expectedDate: string | null; finishedAt: string | null; finishedBy: string | null;
  days: number | null; serviceRemarks: string | null;
}
export interface ServiceOrderList { rows: ServiceOrderRow[]; total: number; page: number; pageCount: number; size: number; takers: string[]; capped: boolean }
export interface ServiceOrderQuery { from: string; to: string; takenBy: string; q: string; page: number; all: boolean }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Body = { error?: string; message?: string } | null;
const explain = (status: number, b: Body) => b?.message || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export function serviceOrderSearch(q: ServiceOrderQuery): string {
  const s = new URLSearchParams();
  for (const k of ['from', 'to', 'takenBy', 'q'] as const) if (q[k].trim()) s.set(k, q[k].trim());
  if (q.all) s.set('all', '1');
  else if (q.page > 1) s.set('page', String(q.page));
  return s.toString();
}

export async function loadServiceOrders(q: ServiceOrderQuery, fetchFn: typeof fetch = fetch): Promise<Result<ServiceOrderList>> {
  try {
    const res = await callBackendResult(`/api/service-issue-orders?${serviceOrderSearch(q)}`, undefined, fetchFn);
    const b = res.body as (ServiceOrderList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as ServiceOrderList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export async function serviceOrdersLink(q: ServiceOrderQuery, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const s = new URLSearchParams(serviceOrderSearch({ ...q, page: 1, all: false }));
    s.set('kind', 'service-issue-orders');
    const res = await callBackendResult(`/api/delivery-export?${s}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
