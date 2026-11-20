// Supplier invoice details per order line (date, number, amount, paid). Calls return { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface SavedInvoice {
  invoiceDate: string | null;
  invoiceNumber: string | null;
  amountMinor: number | null;
  paid: boolean;
  updatedByName: string | null;
  updatedAt: string;
}

// What the form holds: text as typed.
export interface InvoiceDraft {
  invoiceDate: string;
  invoiceNumber: string;
  amount: string;
  paid: boolean;
}

export const amountText = (minor: number | null): string => (minor === null ? '' : (minor / 100).toFixed(2));

export function draftOf(saved: SavedInvoice | undefined): InvoiceDraft {
  return saved
    ? { invoiceDate: saved.invoiceDate ?? '', invoiceNumber: saved.invoiceNumber ?? '', amount: amountText(saved.amountMinor), paid: saved.paid }
    : { invoiceDate: '', invoiceNumber: '', amount: '', paid: false };
}

export const isSameDraft = (a: InvoiceDraft, b: InvoiceDraft): boolean =>
  a.invoiceDate.trim() === b.invoiceDate.trim() && a.invoiceNumber.trim() === b.invoiceNumber.trim() && a.amount.trim() === b.amount.trim() && a.paid === b.paid;

function problem(status: number, body: { error?: string } | null): string {
  switch (body?.error) {
    case 'staff_not_verified': return 'Only a verified staff member can save supplier invoice details.';
    case 'bad_request': return 'Check the date (a real date), the amount (like 125.50) and the invoice number (up to 60 characters).';
    case 'no_line': return 'This line is not on the order any more. Refresh the page.';
    default: return `The server answered with status ${status}.`;
  }
}

export async function loadSupplierInvoices(orderNumber: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; invoices: Record<string, SavedInvoice> } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/supplier-invoices`, undefined, fetchFn);
    const body = res.body as { invoices?: Record<string, SavedInvoice>; error?: string } | null;
    return res.ok && body?.invoices ? { ok: true, invoices: body.invoices } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Saves one line. A blank, unpaid form clears the line, and `invoice` comes back null. */
export async function saveSupplierInvoice(orderNumber: string, lineId: string, draft: InvoiceDraft, fetchFn: typeof fetch = fetch): Promise<{ ok: true; invoice: SavedInvoice | null } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(
      `api/orders/${orderNumber}/supplier-invoices`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineId, invoiceDate: draft.invoiceDate, invoiceNumber: draft.invoiceNumber, amount: draft.amount, paid: draft.paid }) },
      fetchFn,
    );
    const body = res.body as { ok?: boolean; invoice?: SavedInvoice | null; error?: string } | null;
    return res.ok && body?.ok ? { ok: true, invoice: body.invoice ?? null } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
