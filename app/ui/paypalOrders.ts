// The Paypal Orders report page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface ReportLine { lineId: string; title: string; sku: string | null; quantity: number; valueMinor: number; expectedDate: string | null }
export interface ReportOrder { orderId: string; name: string; createdAt: string; customerName: string | null; valueMinor: number; items: number; lines: ReportLine[] }
export interface ReportStatus { statusId: number | null; label: string; orders: number; items: number; valueMinor: number; list: ReportOrder[] }
export interface ReportGroup { key: string; label: string; tone: string; orders: number; items: number; valueMinor: number; statuses: ReportStatus[] }
export interface PaypalReport {
  from: string; to: string; range: string; gateway: string; capped: boolean;
  totals: { orders: number; items: number; valueMinor: number; averageMinor: number };
  groups: ReportGroup[]; gateways: string[];
}
export interface PaypalQuery { from: string; to: string; range: string; gateway: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export function paypalSearch(q: PaypalQuery): string {
  const s = new URLSearchParams();
  if (q.range && q.range !== 'custom') s.set('range', q.range);
  else {
    if (q.from) s.set('from', q.from);
    if (q.to) s.set('to', q.to);
  }
  if (q.gateway) s.set('gateway', q.gateway);
  return s.toString();
}

export async function loadPaypal(q: PaypalQuery, fetchFn: typeof fetch = fetch): Promise<Result<PaypalReport>> {
  try {
    const res = await callBackendResult(`/api/paypal-orders?${paypalSearch(q)}`, undefined, fetchFn);
    const b = res.body as (PaypalReport & { message?: string }) | null;
    return res.ok && Array.isArray(b?.groups) ? { ok: true, data: b as PaypalReport } : { ok: false, message: b?.message || `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Keeps only the orders whose number or an item matches the search, and works the counts out again. */
export function filterReport(groups: ReportGroup[], text: string): ReportGroup[] {
  const needle = text.trim().replace(/^#/, '').toLowerCase();
  if (!needle) return groups;
  const hit = (o: ReportOrder) => o.name.toLowerCase().includes(needle) || o.lines.some((l) => l.title.toLowerCase().includes(needle) || (l.sku ?? '').toLowerCase().includes(needle));
  return groups
    .map((g) => {
      const statuses = g.statuses
        .map((s) => {
          const list = s.list.filter(hit);
          return { ...s, list, orders: list.length, items: list.reduce((n, o) => n + o.items, 0), valueMinor: list.reduce((n, o) => n + o.valueMinor, 0) };
        })
        .filter((s) => s.list.length);
      const ids = new Set(statuses.flatMap((s) => s.list.map((o) => o.orderId)));
      return { ...g, statuses, orders: ids.size, items: statuses.reduce((n, s) => n + s.items, 0), valueMinor: statuses.reduce((n, s) => n + s.valueMinor, 0) };
    })
    .filter((g) => g.statuses.length);
}
