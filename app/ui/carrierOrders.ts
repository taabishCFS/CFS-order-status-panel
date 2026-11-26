// The Carrier Deliveries pages (TNT, Pallet, FurDeco, DHD, White Glove, Allocated + Booked). Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type CarrierKey = 'tnt' | 'pallet' | 'furdeco' | 'dhd' | 'white-glove' | 'allocated' | 'instock';
export interface CarrierRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; email: string; brand: string; postcode: string; product: string; code: string; quantity: number;
  balanceMinor: number; stockedDate: string | null; bookingStatus: string; allStatuses: (number | null)[]; custDate: string | null; driver: string; drop: number | null; slot: string; size: string; deliveryType: string; expectedDate: string | null; lastChaseDate: string | null; date: string | null; van: string; confirmed: string | null; emailed: boolean; lineStatusId: number | null; amountMinor: number;
}
export interface CarrierList { rows: CarrierRow[]; total: number; page: number; pageCount: number; size: number; vans: { id: string; name: string }[]; brands: string[] }
export interface CarrierFilter { key: CarrierKey; q: string; brand: string; van: string; from: string; to: string; page: number; all: boolean; pay?: string; lines?: string[] }

export type ColumnKey = 'orderDate' | 'orderNo' | 'brand' | 'postcode' | 'item' | 'code' | 'qty' | 'custDate' | 'expDate' | 'delDate' | 'van' | 'driver' | 'drop' | 'slot' | 'delType' | 'confirm' | 'status' | 'emailed' | 'total' | 'balance' | 'instockDate' | 'bookingStatus' | 'allStatus';
export const COLUMN_NAMES: Record<ColumnKey, string> = {
  orderDate: 'Order Date', orderNo: 'Order No', brand: 'Brand', postcode: 'Post Code', item: 'Item', code: 'Code', qty: 'Qty', custDate: 'Cust.Date', expDate: 'Exp. Date', delDate: 'Delivery Date',
  van: 'Van', driver: 'Driver', drop: 'Drop', slot: 'Delivery slot', delType: 'Del.Type', confirm: 'Del.Confirm', status: 'Status', emailed: 'Email?', total: 'Unit Total', balance: 'Balance Due', instockDate: 'Instock Date', bookingStatus: 'Booking Status', allStatus: 'All Items Order Status',
};
// Each page shows the columns of its old screen. emailLabel: the page can email the ticked customers. filters: which boxes sit above the list.
export const PAGES: Record<CarrierKey, { title: string; emailLabel?: string; brand: boolean; dates: boolean; van: boolean; search: boolean; pdf?: boolean; pay?: boolean; exportTicked?: boolean; columns: ColumnKey[] }> = {
  tnt: { title: 'TNT Orders', emailLabel: 'Send TNT Email', brand: true, dates: true, van: false, search: true, columns: ['orderDate', 'orderNo', 'brand', 'postcode', 'item', 'qty', 'custDate', 'status', 'emailed', 'total'] },
  furdeco: { title: 'FurDeco Orders', emailLabel: 'Send Bulk Email', brand: true, dates: true, van: false, search: true, columns: ['orderDate', 'orderNo', 'brand', 'postcode', 'item', 'qty', 'custDate', 'status', 'total'] },
  pallet: { title: 'Pallet Orders', brand: true, dates: true, van: false, search: true, columns: ['orderDate', 'orderNo', 'brand', 'item', 'delDate', 'status'] },
  dhd: { title: 'DHD Orders', brand: true, dates: true, van: false, search: true, columns: ['orderDate', 'orderNo', 'brand', 'item', 'expDate', 'delDate', 'status'] },
  'white-glove': { title: 'White Glove Delivery Orders', brand: false, dates: false, van: false, search: false, columns: ['orderDate', 'orderNo', 'brand', 'item', 'code', 'qty', 'delDate', 'status'] },
  instock: { title: 'Instock Delivery Not Booked', brand: false, dates: false, van: false, search: false, pay: true, exportTicked: true, columns: ['orderNo', 'orderDate', 'brand', 'item', 'instockDate', 'balance', 'status', 'bookingStatus', 'allStatus', 'postcode'] },
  allocated: { title: 'Allocated From Stock + Delivery Booked', brand: false, dates: true, van: true, search: true, pdf: true, columns: ['orderDate', 'orderNo', 'brand', 'item', 'code', 'qty', 'delDate', 'van', 'driver', 'drop', 'slot', 'delType', 'confirm', 'status'] },
};

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

function query(f: CarrierFilter): URLSearchParams {
  const q = new URLSearchParams({ key: f.key });
  for (const k of ['q', 'brand', 'van', 'from', 'to', 'pay'] as const) if (f[k]) q.set(k, f[k] as string);
  if (f.lines?.length) q.set('lines', f.lines.join(','));
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
export async function carrierLink(f: CarrierFilter, fetchFn: typeof fetch = fetch, print = false): Promise<Result<{ url: string }>> {
  try {
    const q = query(f);
    q.set('kind', print ? 'carrier-print' : 'carrier');
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
