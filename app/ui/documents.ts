// The document buttons on Order Detail (Save PDF, invoices, delivery note, labels). The server makes a signed link to a
// printable page; staff print it or save it as a PDF from the browser. Calls return { ok: false, message } instead of throwing.
import type { StatusState } from '../../extensions/cfs-order-status/src/types';
import { callBackendResult } from './backend';

export type DocumentKind = 'invoice' | 'exc-vat' | 'inc-vat' | 'delivery-note' | 'label' | 'return-label';

export const RETURN_TYPES = [
  { value: 'Free_Stock', label: 'Free Stock' },
  { value: 'Display_Stock', label: 'Display Stock' },
  { value: 'Send_Back_To_Supplier', label: 'Send Back To Supplier' },
];

// Line statuses whose items go on a delivery note (the legacy list). Keep in step with app/orders/documents.js.
export const DELIVERY_NOTE_STATUS_IDS = [4, 14, 31, 42, 43, 44, 45, 46, 47, 48, 49, 33, 69, 61, 73, 74, 75];

/** { ok: true } or { ok: false, reason }: no balance owed, not on a 50% or 75% refund, and a line in a printable status. */
export function deliveryNoteStatus(input: { balanceAmount: string | null; state: StatusState; lineIds: string[] }): { ok: true } | { ok: false; reason: string } {
  if (Number(input.balanceAmount ?? '0') > 0) return { ok: false, reason: 'A balance is still owed on this order.' };
  const condition = input.state.condition?.value;
  if (condition === '50percRefund' || condition === '75percRefund') return { ok: false, reason: 'This order is on a 50% or 75% refund condition.' };
  const printable = input.lineIds.some((id) => DELIVERY_NOTE_STATUS_IDS.includes(input.state.lines[id]?.statusId as number));
  if (!printable) return { ok: false, reason: 'No product on this order is in a status that goes on a delivery note.' };
  return { ok: true };
}

function problem(status: number, body: { error?: string; message?: string } | null): string {
  switch (body?.error) {
    case 'staff_not_verified': return 'Only a verified staff member can print documents.';
    case 'no_permission': return 'You do not have permission to print delivery notes. Ask a manager.';
    case 'not_allowed': return body.message ?? 'The delivery note cannot be printed for this order.';
    case 'no_lines': return 'Tick the items to put on the return label first.';
    case 'bad_type': return 'Choose a return label type.';
    case 'not_found': return 'This order was not found in Shopify.';
    case 'email_off': return 'Email sending is switched off for this app, so nothing was sent.';
    case 'no_recipient': return 'This order has no customer email address.';
    case 'shopify_unavailable': return 'Shopify could not be read just now. Try again shortly.';
    default: return `The server answered with status ${status}.`;
  }
}

const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function requestDocument(
  orderNumber: string,
  kind: DocumentKind,
  extra: { lineIds?: string[]; type?: string } = {},
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const query = new URLSearchParams({ kind });
  if (extra.lineIds?.length) query.set('lineIds', extra.lineIds.join(','));
  if (extra.type) query.set('type', extra.type);
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/document?${query.toString()}`, undefined, fetchFn);
    const body = res.body as { url?: string; error?: string; message?: string } | null;
    return res.ok && body?.url ? { ok: true, url: body.url } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export interface NoteLogEntry {
  at: string;
  by: string;
}

export async function loadNoteLog(orderNumber: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; log: NoteLogEntry[] } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/document?log=1`, undefined, fetchFn);
    const body = res.body as { log?: NoteLogEntry[]; error?: string; message?: string } | null;
    return res.ok && body?.log ? { ok: true, log: body.log } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

/** Emails the invoice to the customer (Resend Inv.). The key stops a double click sending it twice. */
export async function resendInvoice(
  orderNumber: string,
  idempotencyKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; recipient: string | null } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/resend-invoice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey }) }, fetchFn);
    const body = res.body as { ok?: boolean; recipient?: string | null; error?: string; message?: string } | null;
    return res.ok && body?.ok ? { ok: true, recipient: body.recipient ?? null } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}
