// Update Delivery & Services: six optional charges staff put on an order (VAT included in the amount). Calls return { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface ServiceRow {
  key: string;
  label: string;
  amountMinor: number | null;
}

export interface ServiceDraft {
  on: boolean;
  amount: string;
}

export interface ServiceChange {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
}

const pounds = (minor: number): string => (minor / 100).toFixed(2);

export const draftOf = (row: ServiceRow): ServiceDraft => (row.amountMinor === null ? { on: false, amount: '' } : { on: true, amount: pounds(row.amountMinor) });

/** The request body: the amount for each ticked service, a blank for each unticked one. */
export function requestOf(rows: ServiceRow[], drafts: Record<string, ServiceDraft>): { ok: true; services: Record<string, string> } | { ok: false; message: string } {
  const services: Record<string, string> = {};
  for (const row of rows) {
    const d = drafts[row.key] ?? draftOf(row);
    if (d.on && !d.amount.trim()) return { ok: false, message: `Enter an amount for ${row.label}, or untick it.` };
    services[row.key] = d.on ? d.amount.trim() : '';
  }
  return { ok: true, services };
}

/** For the history entry: pence become pounds text. */
export const historyChanges = (changes: ServiceChange[]): { label: string; from: string | null; to: string | null }[] =>
  changes.map((c) => ({ label: c.label, from: c.from === null ? null : `£${pounds(c.from)}`, to: c.to === null ? null : `£${pounds(c.to)}` }));

function problem(status: number, body: { error?: string; message?: string } | null): string {
  switch (body?.error) {
    case 'staff_not_verified': return 'Only a verified staff member can change delivery and services.';
    case 'no_permission': return 'You do not have permission to change delivery and service charges. Ask a manager.';
    case 'bad_amount': return 'Enter each amount in pounds and pence, like 60.00, above zero.';
    case 'shopify_unavailable': return 'Shopify could not be read just now. Try again shortly.';
    case 'shopify_rejected': return `Shopify did not accept the change: ${body.message ?? 'no reason given'}`;
    default: return `The server answered with status ${status}.`;
  }
}

const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadServices(orderNumber: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; currency: string; services: ServiceRow[] } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/services`, undefined, fetchFn);
    const body = res.body as { currency?: string; services?: ServiceRow[]; error?: string } | null;
    return res.ok && body?.services ? { ok: true, currency: body.currency ?? 'GBP', services: body.services } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function saveServices(orderNumber: string, services: Record<string, string>, fetchFn: typeof fetch = fetch): Promise<{ ok: true; changed: boolean; changes: ServiceChange[] } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ services }) }, fetchFn);
    const body = res.body as { ok?: boolean; changed?: boolean; changes?: ServiceChange[]; error?: string; message?: string } | null;
    return res.ok && body?.ok ? { ok: true, changed: body.changed === true, changes: body.changes ?? [] } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}
