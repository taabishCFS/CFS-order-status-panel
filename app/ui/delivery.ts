// Delivery fleet lists (Van Management) and delivery booking for an order's lines.
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface FleetItem { id: string; name: string; extra: string; active: boolean; driverId?: string | null; coDriverId?: string | null }
export interface Fleet { drivers: FleetItem[]; vans: FleetItem[]; slots: FleetItem[] }
export type FleetKind = 'driver' | 'van' | 'slot';
export interface Booking { lineId: string; partner: string; date: string | null; vanId: string | null; vanName: string; driverId: string | null; driverName: string; drop: number | null; amPm: string | null; bookedByName: string; confirmNote?: string | null }
export interface HistoryEntry { id: string; action: string; partner: string; lineId: string; date: string | null; vanName: string; driverName: string; drop: number | null; amPm: string | null; reason: string; actorName: string; createdAt: string }
export interface OrderDelivery { fleet: Fleet; bookings: Booking[]; history: HistoryEntry[] }
export interface BookForm { partner: string; date: string; vanId: string; driverId: string; drop: string; amPm: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string; duplicates?: string[] }

export const MAX_DROPS = 16;
export const OWN_PARTNER = 'CFS';
// Delivery partners: CFS has van, driver, drop and slot; the carriers only get a date.
export const PARTNERS = ['CFS', 'TNT', 'Pallet', 'Graham Scotland', 'Graham Devon', 'Fur Deco'];
// The delivery slots, as in the old system.
export const SLOT_OPTIONS = [{ value: 'ALL', label: 'All Day' }, { value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
const slotLabel = (v: string | null): string => SLOT_OPTIONS.find((s) => s.value === v)?.label ?? '';

const explain = (status: number, body: Body | null): string => body?.message ?? `The server answered with status ${status}.`;
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

export async function changeFleet(change: { kind: FleetKind; op: 'add' | 'rename' | 'deactivate' | 'restore'; id?: string; name?: string; extra?: string; driverId?: string; coDriverId?: string }, fetchFn: typeof fetch = fetch): Promise<Result<Fleet>> {
  try {
    const res = await callBackendResult('/api/fleet', post(change), fetchFn);
    const b = res.body as ({ fleet?: Fleet } & Body) | null;
    return res.ok && b?.fleet ? { ok: true, data: b.fleet } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export type BulkAction = 'activate' | 'deactivate' | 'delete';
export interface BulkResult { fleet: Fleet; changed: number; blocked: string[] }

/** Switch several vans or drivers on or off, or delete them. Ones still in use are kept and named in `blocked`. */
export async function bulkFleetChange(kind: 'van' | 'driver', action: BulkAction, ids: string[], fetchFn: typeof fetch = fetch): Promise<Result<BulkResult>> {
  try {
    const res = await callBackendResult('/api/fleet', post({ kind, bulk: true, action, ids }), fetchFn);
    const b = res.body as ({ fleet?: Fleet; changed?: number; blocked?: string[] } & Body) | null;
    return res.ok && b?.fleet ? { ok: true, data: { fleet: b.fleet, changed: b.changed ?? 0, blocked: b.blocked ?? [] } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

/** The sentence shown after a bulk change. */
export function bulkText(kind: 'van' | 'driver', action: BulkAction, r: { changed: number; blocked: string[] }): string {
  const noun = `${kind}${r.changed === 1 ? '' : 's'}`;
  const verb = action === 'delete' ? 'Deleted' : action === 'activate' ? 'Made active:' : 'Made inactive:';
  const base = r.changed > 0 ? `${verb} ${r.changed} ${noun}.` : `Nothing was ${action === 'delete' ? 'deleted' : 'changed'}.`;
  return r.blocked.length > 0 ? `${base} ${r.blocked.join(', ')} ${r.blocked.length === 1 ? 'is' : 'are'} in use, so ${r.blocked.length === 1 ? 'it was' : 'they were'} kept. Make ${r.blocked.length === 1 ? 'it' : 'them'} inactive instead.` : base;
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

const bookBody = (action: 'check' | 'book', lineIds: string[], f: BookForm, allowDuplicate = false, emailCustomer = false) => ({
  action, lineIds, partner: f.partner || OWN_PARTNER, date: f.date, vanId: f.vanId || null, driverId: f.driverId || null, drop: f.drop || null, amPm: f.amPm || null, allowDuplicate, emailCustomer,
});

export type BookReply = { ok: true; duplicates: string[]; saved?: number; pmChanged?: number; email?: string } | { ok: false; message: string; duplicates?: string[]; duplicate?: boolean };

async function bookCall(id: string, body: unknown, fetchFn: typeof fetch): Promise<BookReply> {
  try {
    const res = await callBackendResult(`/api/orders/${encodeURIComponent(id)}/delivery`, post(body), fetchFn);
    const b = res.body as ({ duplicates?: string[]; saved?: number; pmChanged?: number; email?: string } & Body) | null;
    if (res.ok) return { ok: true, duplicates: b?.duplicates ?? [], saved: b?.saved, pmChanged: b?.pmChanged, email: b?.email };
    if (b?.error === 'duplicate') return { ok: false, duplicate: true, duplicates: b.duplicates ?? [], message: `Already booked for that date, van and drop: ${(b.duplicates ?? []).join(', ')}.` };
    return { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const checkDrop = (id: string, lineIds: string[], form: BookForm, fetchFn: typeof fetch = fetch) => bookCall(id, bookBody('check', lineIds, form), fetchFn);
export const bookLines = (id: string, lineIds: string[], form: BookForm, allowDuplicate = false, emailCustomer = false, fetchFn: typeof fetch = fetch) => bookCall(id, bookBody('book', lineIds, form, allowDuplicate, emailCustomer), fetchFn);

export async function rescheduleLines(id: string, lineIds: string[], reason: string, emailCustomer: boolean, attempted: boolean, charge: string, fetchFn: typeof fetch = fetch): Promise<Result<{ cleared: number; chargedMinor: number; email: string }>> {
  try {
    const res = await callBackendResult(`/api/orders/${encodeURIComponent(id)}/delivery`, post({ action: 'reschedule', lineIds, reason, emailCustomer, attempted, charge: attempted ? charge : '' }), fetchFn);
    const b = res.body as ({ cleared?: number; chargedMinor?: number; email?: string } & Body) | null;
    return res.ok && typeof b?.cleared === 'number' ? { ok: true, data: { cleared: b.cleared, chargedMinor: b.chargedMinor ?? 0, email: b.email ?? '' } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const bookedText = (r: { saved?: number; pmChanged?: number; email?: string }): string => {
  const base = `Delivery booked for ${r.saved ?? 0} item${r.saved === 1 ? '' : 's'}.${r.pmChanged ? ` ${r.pmChanged} later order${r.pmChanged === 1 ? ' was' : 's were'} moved to PM.` : ''}`;
  if (r.email === 'queued') return `${base} The customer is being emailed.`;
  if (!r.email || r.email === 'not_requested') return base;
  return `${base} The customer email was not sent (${r.email === 'email_off' ? 'email is switched off' : r.email}).`;
};

export const rescheduledText = (r: { cleared: number; chargedMinor?: number; email: string }): string => {
  const base = `Delivery rescheduled for ${r.cleared} item${r.cleared === 1 ? '' : 's'}.${r.chargedMinor ? ` A reschedule charge of £${(r.chargedMinor / 100).toFixed(2)} was added to the order.` : ''}`;
  if (r.email === 'queued') return `${base} The customer is being emailed.`;
  if (r.email === 'not_requested') return base;
  return `${base} The customer email was not sent (${r.email === 'email_off' ? 'email is switched off' : r.email}).`;
};

/** The drops a van can take on a day: numbers 1 to 16. */
export const dropNumbers = (): number[] => Array.from({ length: MAX_DROPS }, (_, i) => i + 1);

export const bookingLine = (b: Booking): string =>
  [b.partner !== OWN_PARTNER && b.partner, b.date ? b.date.split('-').reverse().join('/') : 'marked', b.vanName && `Van: ${b.vanName}`, b.driverName && `Driver: ${b.driverName}`, b.drop !== null && `Drop ${b.drop}`, slotLabel(b.amPm)].filter(Boolean).join(' · ');
