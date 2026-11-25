// The Delivery Report CSV (Max) page ("Maxpro"). Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface MaxproRow {
  orderId: string; orderName: string; date: string; address1: string; address2: string; centre: string; windowStart: string; windowEnd: string; duration: string;
  client: string; contact: string; dateFrom: string; dateTo: string; statusIds: (number | null)[]; brands: string[]; lineIds: string[]; deliverable: number;
}
export interface MaxproList { rows: MaxproRow[]; total: number; page: number; pageCount: number; size: number; brands: string[] }
export interface MaxproFilter { q: string; brand: string; whiteGlove: boolean; all: boolean; page: number }
export type MaxproFile = 'maxpro-order' | 'maxpro-product';
export const MAX_EXPORT_ORDERS = 500;

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }

const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadMaxpro(f: MaxproFilter, fetchFn: typeof fetch = fetch): Promise<Result<MaxproList>> {
  try {
    const q = new URLSearchParams();
    if (f.q) q.set('q', f.q);
    if (f.brand) q.set('brand', f.brand);
    if (f.whiteGlove) q.set('wg', '1');
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/maxpro${q.size ? `?${q}` : ''}`, undefined, fetchFn);
    const b = res.body as (MaxproList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as MaxproList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** The order number from a Shopify order id: gid://shopify/Order/123 -> 123. */
export const numericId = (gid: string): string => gid.split('/').pop() ?? gid;

/** A five-minute download link for MaxPro_Orderwise.csv or MaxPro_Productwise.csv covering the ticked orders. */
export async function maxproLink(kind: MaxproFile, orderIds: string[], fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  if (orderIds.length === 0) return { ok: false, message: 'Please Select Record(s) to Export.' };
  if (orderIds.length > MAX_EXPORT_ORDERS) return { ok: false, message: `Please select at most ${MAX_EXPORT_ORDERS} orders for one file.` };
  try {
    const q = new URLSearchParams({ kind, ids: orderIds.map(numericId).join(',') });
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const DELIVERY_UPDATE_SUBJECT = 'Delivery Update: Order {{order_numbers}}';
export const DELIVERY_UPDATE_MESSAGE = `Hi {{customer_name}},

Here is an update on the delivery of your order {{order_numbers}}.

Regards,
Customer Support`;
