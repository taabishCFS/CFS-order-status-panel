// The Carrier Deliveries pages (TNT, Pallet, FurDeco, DHD, White Glove, Allocated + Booked). Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type CarrierKey = 'tnt' | 'pallet' | 'furdeco' | 'dhd' | 'white-glove' | 'allocated';
export interface CarrierRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; email: string; brand: string; postcode: string; product: string; code: string; quantity: number;
  custDate: string | null; expectedDate: string | null; lastChaseDate: string | null; date: string | null; van: string; confirmed: string | null; emailed: boolean; lineStatusId: number | null; amountMinor: number;
}
export interface CarrierList { rows: CarrierRow[]; total: number; page: number; pageCount: number; size: number; vans: { id: string; name: string }[]; brands: string[] }
export interface CarrierFilter { key: CarrierKey; q: string; brand: string; van: string; from: string; to: string; page: number; all: boolean }

export const PAGES: Record<CarrierKey, { title: string; emailLabel: string; vanFilter?: boolean }> = {
  tnt: { title: 'TNT Orders', emailLabel: 'Send TNT Email' },
  pallet: { title: 'Pallet Orders', emailLabel: 'Send Pallet Email' },
  furdeco: { title: 'FurDeco Orders', emailLabel: 'Send FurDeco Email' },
  dhd: { title: 'DHD Orders', emailLabel: 'Send Email' },
  'white-glove': { title: 'White Glove Delivery Orders', emailLabel: 'Send Email' },
  allocated: { title: 'Allocated From Stock + Delivery Booked', emailLabel: 'Send Email', vanFilter: true },
};

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

function query(f: CarrierFilter): URLSearchParams {
  const q = new URLSearchParams({ key: f.key });
  for (const k of ['q', 'brand', 'van', 'from', 'to'] as const) if (f[k]) q.set(k, f[k]);
  return q;
}

export async function loadCarrier(f: CarrierFilter, fetchFn: typeof fetch = fetch): Promise<Result<CarrierList>> {
  try {
    const q = query(f);
    if (f.all) q.set('all', '1');
    else if (f.page > 1) q.set('page', String(f.page));
    const res = await callBackendResult(`/api/carrier-orders?${q}`, undefined, fetchFn);
    const b = res.body as (CarrierList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as CarrierList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute download link for everything the filters match (all pages). */
export async function carrierLink(f: CarrierFilter, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = query(f);
    q.set('kind', 'carrier');
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
