// The Delivery Booked page: runs of one day, one van and one driver; changing drops; rescheduling; downloads.
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface BookedRow {
  lineId: string; orderId: string; orderName: string; orderDate: string; brand: string; product: string; code: string; size: string;
  quantity: number; box: number | null; delivery: 'confirmed' | 'declined' | null; confirmNote?: string | null; lineStatusId: number | null; amPm: '' | 'AM' | 'PM';
  drop: number | null; deliveryType: string; postcode: string; amountMinor: number; emailed: boolean;
}
export interface BookedRun { key: string; date: string; vanId: string; vanName: string; driverName: string; rows: BookedRow[]; totalMinor: number; currency: string }
export interface BookedList { runs: BookedRun[]; summary: { runs: number; entries: number }; from: string; to: string; brands: string[] }
export interface BookedFilter { from?: string; to?: string; brand?: string; q?: string }
export interface DownloadLink { url: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }

const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function query(f: BookedFilter): string {
  const q = new URLSearchParams();
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (f.brand) q.set('brand', f.brand);
  if (f.q) q.set('q', f.q);
  return q.size ? `?${q}` : '';
}

export async function loadBooked(f: BookedFilter, fetchFn: typeof fetch = fetch): Promise<Result<BookedList>> {
  try {
    const res = await callBackendResult(`/api/delivery-booked${query(f)}`, undefined, fetchFn);
    const b = res.body as (BookedList & Body) | null;
    return res.ok && Array.isArray(b?.runs) ? { ok: true, data: b as BookedList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function act<T>(body: unknown, pick: (b: Record<string, unknown>) => T | null, fetchFn: typeof fetch): Promise<Result<T>> {
  try {
    const res = await callBackendResult('/api/delivery-booked', post(body), fetchFn);
    const b = res.body as (Record<string, unknown> & Body) | null;
    const data = res.ok && b ? pick(b) : null;
    return data ? { ok: true, data } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const saveDropsForRun = (run: { date: string; vanId: string }, rows: { lineId: string; drop: number }[], fetchFn: typeof fetch = fetch) =>
  act<{ saved: number; moved: number }>({ action: 'drops', date: run.date, vanId: run.vanId, rows }, (b) => (typeof b.saved === 'number' ? { saved: b.saved, moved: Number(b.moved) || 0 } : null), fetchFn);

export const rescheduleBooked = (lineIds: string[], reason: string, fetchFn: typeof fetch = fetch) =>
  act<{ cleared: number }>({ action: 'reschedule', lineIds, reason }, (b) => (typeof b.cleared === 'number' ? { cleared: b.cleared } : null), fetchFn);

/** Mark Completed runs on the server; it answers with the sentence to show and whether every order saved. */
export const markCompletedLines = (lineIds: string[], email: boolean, fetchFn: typeof fetch = fetch) =>
  act<{ text: string; failed: number }>({ action: 'complete', lineIds, email }, (b) => (typeof b.text === 'string' ? { text: b.text, failed: Array.isArray(b.failed) ? b.failed.length : 0 } : null), fetchFn);

export interface NotesResult { url: string; printed: number; skipped: { order: string; reason: string }[] }
/** Delivery notes for the orders of the ticked lines: a link to one printable page, plus the orders that were skipped and why. */
export async function printDeliveryNotes(lineIds: string[], fetchFn: typeof fetch = fetch): Promise<Result<NotesResult>> {
  try {
    const res = await callBackendResult('/api/delivery-notes', post({ lineIds }), fetchFn);
    const b = res.body as (Partial<NotesResult> & Body & { skipped?: NotesResult['skipped'] }) | null;
    if (res.ok && typeof b?.url === 'string') return { ok: true, data: { url: b.url, printed: b.printed ?? 0, skipped: b.skipped ?? [] } };
    const why = (b?.skipped ?? []).map((s) => `${s.order}: ${s.reason}`).join(' ');
    return { ok: false, message: [explain(res.status, b), why].filter(Boolean).join(' ') };
  } catch (e) {
    return failure(e);
  }
}

/** A download link: the page export (all of it, or just the ticked lines), or one run's Pick List or Driver Sheet. */
export async function downloadLink(
  what: { kind: 'booked'; filter: BookedFilter; lineIds?: string[] } | { kind: 'picklist' | 'driversheet'; date: string; vanId: string },
  fetchFn: typeof fetch = fetch,
): Promise<Result<DownloadLink>> {
  try {
    const q = new URLSearchParams({ kind: what.kind });
    if (what.kind === 'booked') {
      for (const [k, v] of Object.entries({ from: what.filter.from, to: what.filter.to, brand: what.filter.brand, q: what.filter.q })) if (v) q.set(k, v);
      if (what.lineIds?.length) q.set('lines', what.lineIds.join(','));
    } else {
      q.set('date', what.date);
      q.set('van', what.vanId);
    }
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

// ---- Display helpers ----

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dmy = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
/** "25/11/2026 (Wednesday) - Van 1 - Driver1" */
export function runTitle(run: { date: string; vanName: string; driverName: string }): string {
  const day = DAYS[new Date(`${run.date}T00:00:00Z`).getUTCDay()];
  return `${dmy(run.date)} (${day}) - ${run.vanName}${run.driverName ? ` - ${run.driverName}` : ''}`;
}
export const poundsText = (minor: number): string => `£${(minor / 100).toFixed(2)}`;

/** The New Drop values that differ from the saved drops: the lines to send. The server checks the numbers. */
export function changedDrops(rows: BookedRow[], typed: Record<string, string>): { changes: { lineId: string; drop: number }[]; problem: string | null } {
  const changes = rows.filter((r) => (typed[r.lineId] ?? '').trim() !== '' && Number(typed[r.lineId]) !== r.drop).map((r) => ({ lineId: r.lineId, drop: Number(typed[r.lineId]) }));
  return { changes, problem: changes.some((c) => !Number.isInteger(c.drop) || c.drop < 1) ? 'Drop numbers are whole numbers from 1.' : null };
}

/** The days in a list of runs, in order, each with its runs. */
export function groupByDay(runs: BookedRun[]): { date: string; runs: BookedRun[] }[] {
  const days: { date: string; runs: BookedRun[] }[] = [];
  for (const run of runs) {
    const last = days[days.length - 1];
    if (last && last.date === run.date) last.runs.push(run);
    else days.push({ date: run.date, runs: [run] });
  }
  return days;
}
