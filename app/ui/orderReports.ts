// Order Reports (old Downloads menu). Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface ReportRow {
  orderId: string; name: string; customer: string; createdAt: string; mode: string; subtotalMinor: number; discountMinor: number; coupon: string;
  whiteGloveMinor: number; twoManMinor: number; scotlandMinor: number; totalMinor: number; status: string; outstandingMinor: number;
}
export interface ChartBar { label: string; value: number }
export interface OrderReportData {
  from: string; to: string; count: number; page: number; pageSize: number; rows: ReportRow[];
  pageTotals: { subtotalMinor: number; discountMinor: number; whiteGloveMinor: number; twoManMinor: number; scotlandMinor: number; totalMinor: number };
  summary: { salesMinor: number; validCount: number; validAvgMinor: number };
  charts: { brands: ChartBar[]; payments: ChartBar[]; lineStatuses: ChartBar[] };
  statuses: { id: number; label: string }[];
  brands: string[];
}
export interface ReportQuery { from: string; to: string; statuses: number[]; sort: string; dir: 'asc' | 'desc'; page: number }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }
const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export function reportSearch(q: ReportQuery): URLSearchParams {
  const s = new URLSearchParams({ from: q.from, to: q.to, sort: q.sort, dir: q.dir, page: String(q.page) });
  if (q.statuses.length) s.set('statuses', q.statuses.join(','));
  return s;
}

export async function loadOrderReport(q: ReportQuery, fetchFn: typeof fetch = fetch): Promise<Result<OrderReportData>> {
  try {
    const res = await callBackendResult(`/api/order-reports?${reportSearch(q)}`, undefined, fetchFn);
    const b = res.body as (OrderReportData & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as OrderReportData } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** A five-minute download link for the line-by-line CSV of every order on these filters (only one brand's lines when one is chosen). */
export async function orderReportLink(q: ReportQuery, brand: string, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const s = new URLSearchParams({ kind: 'order-report', from: q.from, to: q.to });
    if (q.statuses.length) s.set('statuses', q.statuses.join(','));
    if (brand) s.set('brand', brand);
    const res = await callBackendResult(`/api/delivery-export?${s}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

export const PRESETS = ['Today', 'Yesterday', 'Current Week', 'Previous Week', 'Current Month', 'Previous Month', 'Current Year', 'Previous Year'] as const;
export type Preset = (typeof PRESETS)[number];

/** The old page's date shortcuts. today is YYYY-MM-DD; weeks start on Monday. */
export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const t = new Date(`${today}T00:00:00Z`);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
  switch (preset) {
    case 'Today': return { from: today, to: today };
    case 'Yesterday': { const d = iso(addDays(t, -1)); return { from: d, to: d }; }
    case 'Current Week': return { from: iso(monday), to: iso(addDays(monday, 6)) };
    case 'Previous Week': return { from: iso(addDays(monday, -7)), to: iso(addDays(monday, -1)) };
    case 'Current Month': return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case 'Previous Month': return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case 'Current Year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'Previous Year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

export const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
