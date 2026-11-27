// Bulk Reschedule and Not Confirmed on the delivery pages (TNT, Pallet, FurDeco, DHD, White Glove, Allocated, Delivery Booked).
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type FollowUpPage = 'tnt' | 'pallet' | 'furdeco' | 'dhd' | 'white-glove' | 'allocated' | 'booked';
export interface RescheduleResult { lines: number; orders: number; emailed: number; emailFailed: number; skipped: number; clearFailed: number }
export interface NotConfirmedResult { orders: number; emailed: number; emailFailed: number }
type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }

async function post<T>(body: object, fetchFn: typeof fetch): Promise<Result<T>> {
  try {
    const res = await callBackendResult('/api/delivery-followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    const b = res.body as (T & Body) | null;
    return res.ok && b && !b.error ? { ok: true, data: b as T } : { ok: false, message: b?.message ?? `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const rescheduleLines = (lineIds: string[], date: string, page: FollowUpPage, email: boolean, fetchFn: typeof fetch = fetch) =>
  post<RescheduleResult>({ action: 'reschedule', lineIds, date, page, email }, fetchFn);
export const sendNotConfirmed = (lineIds: string[], fetchFn: typeof fetch = fetch) => post<NotConfirmedResult>({ action: 'not_confirmed', lineIds }, fetchFn);

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dmy = (iso: string) => iso.split('-').reverse().join('/');

/** The sentence after Bulk Reschedule. */
export function rescheduleText(r: RescheduleResult, date: string, email: boolean): string {
  let text = `${s(r.lines, 'line')} (${s(r.orders, 'order')}) moved to ${dmy(date)}.`;
  if (!email) text += ' The customers were not emailed.';
  else {
    text += ` ${s(r.emailed, 'customer email')} queued with a new confirm link.`;
    if (r.emailFailed) text += ` ${s(r.emailFailed, 'order')} could not be emailed (email off or no address).`;
  }
  if (r.skipped) text += ` ${s(r.skipped, 'line')} had no booking and ${r.skipped === 1 ? 'was' : 'were'} left out: book ${r.skipped === 1 ? 'it' : 'them'} on Book Delivery first.`;
  if (r.clearFailed) text += ` The old confirmation could not be cleared on ${s(r.clearFailed, 'order')}; open ${r.clearFailed === 1 ? 'it' : 'them'} and check.`;
  return text;
}

/** The sentence after Not Confirmed. */
export function notConfirmedText(r: NotConfirmedResult): string {
  let text = `Not Confirmed email queued for ${s(r.emailed, 'customer')}.`;
  if (r.emailFailed) text += ` ${s(r.emailFailed, 'order')} could not be emailed (email off or no address).`;
  return text;
}

/** Tomorrow as YYYY-MM-DD (the date box starts there). */
export function tomorrow(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
