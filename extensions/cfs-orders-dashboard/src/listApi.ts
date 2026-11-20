// Calls to the backend order lists. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface Filters {
  page?: number;
  all?: boolean;
  brand?: string;
  from?: string;
  to?: string;
  q?: string;
  statusId?: number | null;
  takenBy?: string;
  archived?: boolean;
  insurance?: boolean;
}

export type PayType = 'paid' | 'partial' | 'awaiting' | 'failed';

export interface OrderRow {
  orderId: string;
  name: string;
  createdAt: string;
  site: string | null;
  customerName: string | null;
  email: string | null;
  gateway: string | null;
  totalMinor: number;
  currency: string;
  payType: PayType;
  tone: 'red' | 'blue' | null;
  orderStatusId: number | null;
  lineStatuses: (number | null)[];
  orderTakenBy: string | null;
  orderSource: string | null;
  repeatCustomer: boolean;
  archived: boolean;
}

export interface OrderListData {
  rows: OrderRow[];
  total: number;
  page: number;
  pageCount: number;
  capped: boolean;
}

export interface LineRow {
  lineId: string;
  orderId: string;
  orderName: string;
  orderCreatedAt: string;
  site: string | null;
  brand: string;
  product: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  priceMinor: number;
  currency: string;
  lineStatusId: number | null;
  expectedDate: string | null;
  deliveryOutcome: string | null;
  supplierInvoicePaid: boolean;
}

export interface LineListData {
  rows: LineRow[];
  summary: { lines: number; orders: number; units: number };
  capped: boolean;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

export function buildQuery(f: Filters): string {
  const parts: string[] = [];
  const add = (key: string, value: string | number | null | undefined) => {
    if (value !== undefined && value !== null && value !== '') parts.push(`${key}=${encodeURIComponent(String(value))}`);
  };
  add('page', f.page);
  if (f.all) add('all', 1);
  add('brand', f.brand);
  add('from', f.from);
  add('to', f.to);
  add('q', f.q);
  add('statusId', f.statusId);
  add('takenBy', f.takenBy);
  if (f.archived) add('archived', 1);
  if (f.insurance) add('insurance', 1);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function call<T>(path: string, init: RequestInit | undefined, fetchFn: typeof fetch, explain: Record<string, string> = {}): Promise<Result<T>> {
  try {
    const res = await callBackendResult(path, init, fetchFn);
    if (res.ok) return { ok: true, ...(res.body as T) } as Result<T>;
    const code = (res.body as { error?: string } | null)?.error;
    return { ok: false, message: (code && (explain[code] ?? code)) || `The server answered with status ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function loadOrderList(f: Filters, fetchFn: typeof fetch = fetch): Promise<{ ok: true; data: OrderListData } | { ok: false; message: string }> {
  const res = await call<OrderListData>(`/api/order-list${buildQuery(f)}`, undefined, fetchFn);
  if (!res.ok) return res;
  const { ok: _ok, ...data } = res;
  return { ok: true, data: data as OrderListData };
}

export async function loadLineList(f: Filters, fetchFn: typeof fetch = fetch): Promise<{ ok: true; data: LineListData } | { ok: false; message: string }> {
  const res = await call<LineListData>(`/api/line-list${buildQuery(f)}`, undefined, fetchFn);
  if (!res.ok) return res;
  const { ok: _ok, ...data } = res;
  return { ok: true, data: data as LineListData };
}

export const loadBrands = (fetchFn: typeof fetch = fetch) => call<{ brands: string[] }>('/api/brands', undefined, fetchFn);

export const archiveOrders = (orderIds: string[], archived: boolean, fetchFn: typeof fetch = fetch) =>
  call<{ count: number }>(
    '/api/orders/archive',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIds, archived }) },
    fetchFn,
    { staff_not_verified: 'Only a verified staff member can archive or restore orders.' },
  );
