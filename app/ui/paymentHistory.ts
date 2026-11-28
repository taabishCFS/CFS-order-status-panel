// The Payment History page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface PaymentRow {
  id: string; orderId: string | null; orderName: string; reference: string; type: 'Payment' | 'Refund'; amountMinor: number; currency: string;
  payType: string; email: string; customer: string; date: string | null; test: boolean;
}
export interface PaymentPage { rows: PaymentRow[]; hasNext: boolean; hasPrevious: boolean; next: string | null; previous: string | null; size: number }
export interface PaymentQuery { from: string; to: string; after: string; before: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export function paymentQueryString({ from, to, after, before }: PaymentQuery): string {
  const s = new URLSearchParams();
  if (from) s.set('from', from);
  if (to) s.set('to', to);
  if (after) s.set('after', after);
  else if (before) s.set('before', before);
  return s.toString();
}

export async function loadPayments(query: PaymentQuery, fetchFn: typeof fetch = fetch): Promise<Result<PaymentPage>> {
  try {
    const res = await callBackendResult(`/api/payment-history?${paymentQueryString(query)}`, undefined, fetchFn);
    const b = res.body as (PaymentPage & { message?: string }) | null;
    if (res.ok && Array.isArray(b?.rows)) return { ok: true, data: b as PaymentPage };
    return { ok: false, message: b?.message ?? `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
