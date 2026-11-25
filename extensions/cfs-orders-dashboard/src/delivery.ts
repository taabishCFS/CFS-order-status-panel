// Delivery fleet lists (Van Management) and delivery booking for an order's lines.
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface FleetItem { id: string; name: string; extra: string; active: boolean }
export interface Fleet { drivers: FleetItem[]; vans: FleetItem[]; slots: FleetItem[] }
export type FleetKind = 'driver' | 'van' | 'slot';
export interface Booking { lineId: string; date: string; vanId: string | null; vanName: string; driverId: string | null; driverName: string; slotId: string | null; slotName: string; drop: number | null; amPm: string | null; bookedByName: string }
export interface HistoryEntry { id: string; action: string; lineId: string; date: string | null; vanName: string; driverName: string; drop: number | null; amPm: string | null; reason: string; actorName: string; createdAt: string }
export interface OrderDelivery { fleet: Fleet; bookings: Booking[]; history: HistoryEntry[] }
export interface BookForm { date: string; vanId: string; driverId: string; slotId: string; drop: string; amPm: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; duplicates?: string[] }

export const MAX_DROPS = 16;

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can do this.',
  no_permission: 'You do not have permission for this. Ask a manager to tick it on the Permissions page.',
  duplicate_name: 'That name is already in the list.',
  not_found: 'That item was not found. Refresh and try again.',
  no_lines: 'Those items were not found on the order. Refresh and try again.',
  not_booked: 'None of the ticked items has a booking to reschedule.',
  unknown_van: 'That van is not available. Refresh and choose again.',
  unknown_driver: 'That driver is not available. Refresh and choose again.',
  unknown_slot: 'That slot is not available. Refresh and choose again.',
  bad_date: 'Choose a valid date.',
  bad_drop: `The drop must be a number from 1 to ${MAX_DROPS}.`,
  bad_am_pm: 'Choose AM or PM.',
  drop_needs_van: 'Choose a van before choosing a drop.',
  reason_required: 'Give a reason for rescheduling.',
  bad_request: 'The request was not accepted. Refresh the page and try again.',
};
const explain = (status: number, body: Body | null): string => EXPLAIN[body?.error ?? ''] ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function loadFleet(fetchFn: typeof fetch = fetch): Promise<Result<Fleet>> {
  try {
    const res = await callBackendResult('/api/fleet', undefined, fetchFn);
    const b = res.body as (Fleet & Body) | null;
    return res.ok && Array.isArray(b?.vans) ? { ok: true, data: b as Fleet } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export async function changeFleet(change: { kind: FleetKind; op: 'add' | 'rename' | 'deactivate' | 'restore'; id?: string; name?: string; extra?: string }, fetchFn: typeof fetch = fetch): Promise<Result<Fleet>> {
  try {
    const res = await callBackendResult('/api/fleet', post(change), fetchFn);
    const b = res.body as ({ fleet?: Fleet } & Body) | null;
    return res.ok && b?.fleet ? { ok: true, data: b.fleet } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export async function loadOrderDelivery(id: string, fetchFn: typeof fetch = fetch): Promise<Result<OrderDelivery>> {
  try {
    const res = await callBackendResult(`/api/orders/${encodeURIComponent(id)}/delivery`, undefined, fetchFn);
    const b = res.body as (OrderDelivery & Body) | null;
    return res.ok && Array.isArray(b?.bookings) ? { ok: true, data: b as OrderDelivery } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

const bookBody = (action: 'check' | 'book', lineIds: string[], f: BookForm, allowDuplicate = false) => ({
  action, lineIds, date: f.date, vanId: f.vanId || null, driverId: f.driverId || null, slotId: f.slotId || null, drop: f.drop || null, amPm: f.amPm || null, allowDuplicate,
});

export type BookReply = { ok: true; duplicates: string[]; saved?: number; pmChanged?: number } | { ok: false; message: string; duplicates?: string[]; duplicate?: boolean };

async function bookCall(id: string, body: unknown, fetchFn: typeof fetch): Promise<BookReply> {
  try {
    const res = await callBackendResult(`/api/orders/${encodeURIComponent(id)}/delivery`, post(body), fetchFn);
    const b = res.body as ({ duplicates?: string[]; saved?: number; pmChanged?: number } & Body) | null;
    if (res.ok) return { ok: true, duplicates: b?.duplicates ?? [], saved: b?.saved, pmChanged: b?.pmChanged };
    if (b?.error === 'duplicate') return { ok: false, duplicate: true, duplicates: b.duplicates ?? [], message: `Already booked for that date, van and drop: ${(b.duplicates ?? []).join(', ')}.` };
    return { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const checkDrop = (id: string, lineIds: string[], form: BookForm, fetchFn: typeof fetch = fetch) => bookCall(id, bookBody('check', lineIds, form), fetchFn);
export const bookLines = (id: string, lineIds: string[], form: BookForm, allowDuplicate = false, fetchFn: typeof fetch = fetch) => bookCall(id, bookBody('book', lineIds, form, allowDuplicate), fetchFn);

export async function rescheduleLines(id: string, lineIds: string[], reason: string, emailCustomer: boolean, fetchFn: typeof fetch = fetch): Promise<Result<{ cleared: number; email: string }>> {
  try {
    const res = await callBackendResult(`/api/orders/${encodeURIComponent(id)}/delivery`, post({ action: 'reschedule', lineIds, reason, emailCustomer }), fetchFn);
    const b = res.body as ({ cleared?: number; email?: string } & Body) | null;
    return res.ok && typeof b?.cleared === 'number' ? { ok: true, data: { cleared: b.cleared, email: b.email ?? '' } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const bookedText = (r: { saved?: number; pmChanged?: number }): string =>
  `Delivery booked for ${r.saved ?? 0} item${r.saved === 1 ? '' : 's'}.${r.pmChanged ? ` ${r.pmChanged} later order${r.pmChanged === 1 ? ' was' : 's were'} moved to PM.` : ''}`;

export const rescheduledText = (r: { cleared: number; email: string }): string => {
  const base = `Delivery rescheduled for ${r.cleared} item${r.cleared === 1 ? '' : 's'}.`;
  if (r.email === 'queued') return `${base} The customer is being emailed.`;
  if (r.email === 'not_requested') return base;
  return `${base} The customer email was not sent (${r.email === 'email_off' ? 'email is switched off' : r.email}).`;
};

/** The drops a van can take on a day: numbers 1 to 16. */
export const dropNumbers = (): number[] => Array.from({ length: MAX_DROPS }, (_, i) => i + 1);

export const bookingLine = (b: Booking): string =>
  [b.date.split('-').reverse().join('/'), b.vanName && `Van ${b.vanName}`, b.driverName && `Driver ${b.driverName}`, b.drop !== null && `Drop ${b.drop}`, b.amPm, b.slotName].filter(Boolean).join(' · ');
