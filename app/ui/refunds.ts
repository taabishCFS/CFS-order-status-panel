// Refund requests on an order: a list for accounts to act on. Nothing here moves money. Calls return { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import REASONS from './refundReasons.json';

export interface RefundRequest {
  id: string;
  reason: string;
  type: 'part' | 'full';
  amountMinor: number;
  lineIds: string[];
  notes: string;
  status: string;
  createdByName: string | null;
  createdAt: string;
}

export interface RefundForm {
  clientKey: string;
  reason: string;
  type: 'part' | 'full';
  amount: string;
  lineIds: string[];
  notes: string;
}

export const REASON_OPTIONS: { code: string; label: string }[] = REASONS;

export const moneyText = (minor: number): string => (minor / 100).toFixed(2);
/**
 * The amount of a Full Refund, worked out like Shopify does: the ticked products at their final price (after discount),
 * or everything still refundable when none are ticked, never more than is still refundable.
 * Returns pence, or null when a ticked product has no reliable final price (its quantity was edited), so staff must type it.
 */
export function fullRefundMinor(lines: { id: string; final: { amount: string } | null }[], lineIds: string[], refundableMinor: number): number | null {
  if (lineIds.length === 0) return refundableMinor;
  let sum = 0;
  for (const id of lineIds) {
    const line = lines.find((l) => l.id === id);
    if (!line?.final) return null;
    sum += Math.round(Number(line.final.amount) * 100);
  }
  return Math.min(sum, refundableMinor);
}
export const reasonLabel = (code: string): string => REASONS.find((r) => r.code === code)?.label ?? code;
export const refundSummary = (type: 'part' | 'full', amountMinor: number, reason: string): string =>
  `${type === 'full' ? 'Full' : 'Part'} refund £${moneyText(amountMinor)}: ${reasonLabel(reason)}`;

function problem(status: number, body: { error?: string; refundableMinor?: number } | null): string {
  switch (body?.error) {
    case 'staff_not_verified': return 'Only a verified staff member can add a refund.';
    case 'bad_reason': return 'Choose a reason.';
    case 'bad_type': return 'Choose a refund type.';
    case 'bad_amount': return 'Enter the amount in pounds and pence, like 25.50. A part refund needs an amount.';
    case 'bad_request': return 'The refund request was not valid. Check the notes are under 1000 characters.';
    case 'too_much': return `That is more than can still be refunded on this order (£${moneyText(body.refundableMinor ?? 0)} left).`;
    case 'no_order': return 'This order has not reached the app yet. Try again shortly, or press Refresh order data.';
    case 'no_line': return 'One of the chosen products is not on this order. Refresh the page.';
    default: return `The server answered with status ${status}.`;
  }
}

const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadRefunds(orderNumber: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; requests: RefundRequest[]; refundableMinor: number } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/refunds`, undefined, fetchFn);
    const body = res.body as { requests?: RefundRequest[]; refundableMinor?: number; error?: string } | null;
    return res.ok && body?.requests ? { ok: true, requests: body.requests, refundableMinor: body.refundableMinor ?? 0 } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function addRefund(orderNumber: string, form: RefundForm, fetchFn: typeof fetch = fetch): Promise<{ ok: true; request: RefundRequest } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/refunds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }, fetchFn);
    const body = res.body as { ok?: boolean; request?: RefundRequest; error?: string; refundableMinor?: number } | null;
    return res.ok && body?.ok && body.request ? { ok: true, request: body.request } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}
