// Marketing Sales Report (old Downloads menu). Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export const GROUPS: Record<string, string> = { brand: 'Brand', range: 'Range', category: 'Category', product: 'Product', month: 'Month', day: 'Day', source: 'Order source', order: 'Orders' };
export const SORTS: [string, string][] = [['sales', 'Highest item sales'], ['units', 'Most units'], ['orders', 'Most orders'], ['name', 'Name / date ascending']];
export const UNSPECIFIED = '__unspecified__';

export interface Filters {
  from: string; to: string; brand: string; range: string; category: string; product: string; search: string;
  site: string; source: string; status: string; order: string; group: string; sort: string; page: number;
}
export interface MarketingRow { key: string; name: string; productId: string; sku: string; orders: number; units: number; salesMinor: number }
export interface MarketingData {
  summary: { orders: number; units: number; salesMinor: number; products: number };
  rows: MarketingRow[]; groupCount: number; page: number; pageCount: number; pageSize: number; capped: boolean; catalogOk: boolean;
  choices: { brands: string[]; ranges: string[]; categories: string[]; sites: string[]; hasNoSite: boolean; sources: string[]; statuses: { id: number; label: string }[] };
  selectedOrder: string; selectedProduct: string;
}

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

/** Start of the report: this month up to today, every site (the old report started on CFS; most of our orders have no site yet), by brand, highest sales first. */
export const startFilters = (today: string): Filters => ({ from: `${today.slice(0, 8)}01`, to: today, brand: '', range: '', category: '', product: '', search: '', site: '', source: '', status: '', order: '', group: 'brand', sort: 'sales', page: 1 });

export function filterQuery(f: Filters): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== '' && v !== 0 && !(k === 'page' && v === 1)) q.set(k, String(v));
  return q;
}

export async function loadMarketing(f: Filters, fetchFn: typeof fetch = fetch): Promise<Result<MarketingData>> {
  try {
    const res = await callBackendResult(`/api/marketing-sales?${filterQuery(f)}`, undefined, fetchFn);
    const b = res.body as (MarketingData & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as MarketingData } : { ok: false, message: b?.message ?? `The server answered with status ${res.status}.` };
  } catch (e) {
    return failure(e);
  }
}

export async function marketingLink(f: Filters, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = filterQuery({ ...f, page: 1 });
    q.set('kind', 'marketing-sales');
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: b?.message ?? `The server answered with status ${res.status}.` };
  } catch (e) {
    return failure(e);
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** The old report's quick dates. Current periods run up to today; weeks start Monday. */
export function quickDates(today: string): { label: string; from: string; to: string }[] {
  const t = utc(today);
  const week = addDays(t, -((t.getUTCDay() + 6) % 7));
  const month = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const year = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const yest = iso(addDays(t, -1));
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: yest, to: yest },
    { label: 'Current week', from: iso(week), to: today },
    { label: 'Previous week', from: iso(addDays(week, -7)), to: iso(addDays(week, -1)) },
    { label: 'Current month', from: iso(month), to: today },
    { label: 'Previous month', from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))), to: iso(addDays(month, -1)) },
    { label: 'Current year', from: iso(year), to: today },
    { label: 'Previous year', from: `${t.getUTCFullYear() - 1}-01-01`, to: iso(addDays(year, -1)) },
  ];
}

/** The filters that narrow the report to one row, as the old click-through (month and day keep inside the chosen dates). */
export function rowFilters(group: string, row: MarketingRow, f: Filters): Partial<Filters> | null {
  switch (group) {
    case 'brand': return { brand: row.key };
    case 'range': return row.key === 'No collection' ? null : { range: row.key };
    case 'category': return row.key === 'No category' ? null : { category: row.key };
    case 'product': return row.productId ? { product: row.productId } : null;
    case 'month': {
      const [y, m] = row.key.split('-').map(Number);
      const last = iso(new Date(Date.UTC(y, m, 0)));
      const first = `${row.key}-01`;
      return { from: first > f.from ? first : f.from, to: last < f.to ? last : f.to };
    }
    case 'day': return { from: row.key, to: row.key };
    case 'source': return { source: row.key === 'Unspecified' ? UNSPECIFIED : row.key };
    case 'order': return { order: row.productId };
    default: return null;
  }
}

/** Where the "View ..." button of a row goes next: brand -> ranges, range or category -> products, product -> monthly sales. */
export const NEXT_VIEW: Record<string, [string, string]> = { brand: ['range', 'View ranges'], range: ['product', 'View products'], category: ['product', 'View products'], product: ['month', 'View monthly sales'] };
