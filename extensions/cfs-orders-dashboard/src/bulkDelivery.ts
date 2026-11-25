// The bulk Book Delivery pages: the list of lines ready to book, and the Delivery Booking page for the ticked lines.
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface BookableRow {
  lineId: string; orderId: string; orderName: string; orderCreatedAt: string; brand: string; product: string; code: string;
  quantity: number; lineStatusId: number | null; postcode: string; deliveryType: string; prebook: boolean;
}
export interface BookableList { rows: BookableRow[]; summary: { lines: number; orders: number }; total: number; page: number; pageCount: number; brands: string[] }
export interface BookingRow {
  lineId: string; orderId: string; orderName: string; orderCreatedAt: string | null; product: string; code: string; quantity: number;
  lineStatusId: number | null; postcode: string; deliveryType: string; deliveryDate: string | null; drop: number | null; amPm: '' | 'AM' | 'PM'; prebook: boolean; emailed: boolean;
}
export interface BookingPage { rows: BookingRow[]; vans: { id: string; name: string }[] }
export type MarkKey = 'TNT' | 'PALLET' | 'SGK' | 'FURDECO';
export const MARK_BUTTONS: { key: MarkKey; label: string }[] = [{ key: 'TNT', label: 'TNT' }, { key: 'PALLET', label: 'PALLET' }, { key: 'SGK', label: 'SGK' }, { key: 'FURDECO', label: 'FURDECO' }];
export const MAX_DROP = 16;
export const PREBOOK = 'prebook';

type Result<T> = { ok: true; data: T } | { ok: false; message: string; duplicates?: string[] };
interface Body { error?: string; duplicates?: string[] }

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can do this.',
  no_permission: 'You do not have permission to book deliveries. Ask a manager to tick it on the Permissions page.',
  no_lines: 'Some of those items can no longer be booked. Go back, refresh the list and try again.',
  not_booked: 'None of the ticked items has a booking to reschedule.',
  unknown_van: 'That van is not available. Refresh and choose again.',
  duplicate: 'Another order already has that van and drop on that day.',
  bad_date: 'Select Delivery Date.',
  van_required: 'Select Driver/van.',
  drop_required: 'Select Drop Number.',
  slot_required: 'Select Time Slot.',
  bad_request: 'The request was not accepted. Refresh the page and try again.',
};
const explain = (status: number, body: Body | null): string => EXPLAIN[body?.error ?? ''] ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function loadBookable(p: { q?: string; brand?: string; page?: number }, fetchFn: typeof fetch = fetch): Promise<Result<BookableList>> {
  try {
    const q = new URLSearchParams();
    if (p.q) q.set('q', p.q);
    if (p.brand) q.set('brand', p.brand);
    if (p.page && p.page > 1) q.set('page', String(p.page));
    const res = await callBackendResult(`/api/delivery-bulk${q.size ? `?${q}` : ''}`, undefined, fetchFn);
    const b = res.body as (BookableList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as BookableList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function act<T>(body: unknown, pick: (b: Record<string, unknown>) => T | null, fetchFn: typeof fetch): Promise<Result<T>> {
  try {
    const res = await callBackendResult('/api/delivery-bulk', post(body), fetchFn);
    const b = res.body as (Record<string, unknown> & Body) | null;
    const data = res.ok && b ? pick(b) : null;
    return data ? { ok: true, data } : { ok: false, message: explain(res.status, b), duplicates: b?.duplicates };
  } catch (e) {
    return failure(e);
  }
}

export const markLines = (mark: MarkKey, lineIds: string[], fetchFn: typeof fetch = fetch) =>
  act<{ marked: number }>({ action: 'mark', mark, lineIds }, (b) => (typeof b.marked === 'number' ? { marked: b.marked } : null), fetchFn);

export const loadBookingPage = (lineIds: string[], fetchFn: typeof fetch = fetch) =>
  act<BookingPage>({ action: 'load', lineIds }, (b) => (Array.isArray(b.rows) ? (b as unknown as BookingPage) : null), fetchFn);

export interface BookResult { saved: number; orders: number; emailed: number; emailFailed: number; emailCode: string | null; pmChanged: number }
export const bookBulk = (req: { date: string; vanId: string; rows: { lineId: string; drop: number; amPm: string }[]; allowDuplicate: boolean }, fetchFn: typeof fetch = fetch) =>
  act<BookResult>({ action: 'book', ...req }, (b) => (typeof b.saved === 'number' ? (b as unknown as BookResult) : null), fetchFn);

export const rescheduleBulk = (lineIds: string[], fetchFn: typeof fetch = fetch) =>
  act<{ cleared: number }>({ action: 'reschedule', lineIds }, (b) => (typeof b.cleared === 'number' ? { cleared: b.cleared } : null), fetchFn);

/** The sentence shown after booking. */
export function bookedBulkText(r: BookResult, prebook: boolean): string {
  const what = prebook ? 'Pre-booked' : 'Booked';
  const base = `${what} ${r.saved} item${r.saved === 1 ? '' : 's'} on ${r.orders} order${r.orders === 1 ? '' : 's'}.${r.pmChanged ? ` ${r.pmChanged} later order${r.pmChanged === 1 ? ' was' : 's were'} moved to PM.` : ''}`;
  if (r.emailFailed === 0) return `${base} Booking confirmation emailed to ${r.emailed} customer${r.emailed === 1 ? '' : 's'}.`;
  const why = r.emailCode === 'email_off' ? 'email is switched off' : r.emailCode ?? 'unknown reason';
  return `${base} ${r.emailFailed} customer email${r.emailFailed === 1 ? ' was' : 's were'} not sent (${why}).`;
}

// ---- Rules copied from the old system's Delivery Booking page ----

/** Change the first row's drop and every row below follows: the same order keeps the drop, the next order takes the next number. */
export function cascadeDrops(orderIds: string[], drops: string[], startDrop: number): string[] {
  const out = [...drops];
  if (!Number.isInteger(startDrop) || startDrop < 1 || orderIds.length === 0) return out;
  let drop = startDrop;
  out[0] = String(Math.min(drop, MAX_DROP));
  for (let i = 1; i < orderIds.length; i++) {
    if (orderIds[i] !== orderIds[i - 1]) drop += 1;
    out[i] = String(Math.min(drop, MAX_DROP));
  }
  return out;
}

/** PM on a row makes every row below it PM. */
export const forcePmFrom = (slots: string[], index: number): string[] => slots.map((s, i) => (i >= index ? 'PM' : s));

export interface BookingForm { date: string; vanId: string; drops: Record<string, string>; slots: Record<string, string> }

/** The checks the old page makes before EMAIL DELIVERY BOOKING, with its wording. Returns the first problem or null. */
export function bookingProblem(form: BookingForm, tickedIds: string[]): string | null {
  if (tickedIds.length === 0) return 'Please Select Record(s) to Confirm Booking.';
  for (const id of tickedIds) {
    if (!form.drops[id]) return 'Select Drop Number.';
    if (!form.slots[id]) return 'Select Time Slot.';
  }
  if (!form.date) return 'Select Delivery Date.';
  if (!form.vanId) return 'Select Driver/van.';
  return null;
}

/** Order numbers from a Maxpro CSV: 10 columns; the first column is the order, with everything before the last hyphen and after the first space dropped. */
export function ordersFromMaxproCsv(text: string): { ok: true; orders: string[] } | { ok: false; message: string } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) return { ok: false, message: 'The CSV appears to be empty.' };
  if (rows[0].length !== 10) return { ok: false, message: 'Please upload a proper Maxpro CSV file (expected 10 columns).' };
  const orders: string[] = [];
  for (const row of rows) {
    const raw = (row[0] ?? '').trim();
    if (!raw || /^order( no)?$/i.test(raw)) continue;
    const dash = raw.lastIndexOf('-');
    const clean = (dash >= 0 ? raw.slice(dash + 1) : raw).replace(/\s.*$/, '').trim();
    if (clean) orders.push(clean);
  }
  return { ok: true, orders };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ---- The ticked lines travel from the list page to the booking page ----

let carried: string[] = [];
const KEY = 'cfs.bookDelivery.lines';
/** Remember the ticked line ids for the booking page (in memory, and in the tab's session storage in case the page is reloaded). */
export function carryLines(ids: string[]): void {
  carried = [...ids];
  try { sessionStorage.setItem(KEY, JSON.stringify(carried)); } catch { /* storage can be blocked: memory is enough */ }
}
export function carriedLines(): string[] {
  if (carried.length > 0) return carried;
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(stored)) carried = stored.filter((x) => typeof x === 'string');
  } catch { /* nothing stored */ }
  return carried;
}
