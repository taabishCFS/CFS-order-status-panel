import { describe, expect, it, vi } from 'vitest';
import { amountText, draftOf, isSameDraft, loadSupplierInvoices, saveSupplierInvoice } from './supplierInvoice';

const asFetch = (f: unknown) => f as unknown as typeof fetch;
const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response);
const L = 'gid://shopify/LineItem/1';
const invoice = { invoiceDate: '2026-11-20', invoiceNumber: 'INV-1', amountMinor: 123450, paid: true, updatedByName: 'Sam Patel', updatedAt: '2026-11-20T10:00:00.000Z' };

describe('amountText', () => {
  it('writes pence as pounds with two decimals, blank when not set', () => {
    expect(amountText(123450)).toBe('1234.50');
    expect(amountText(5)).toBe('0.05');
    expect(amountText(0)).toBe('0.00');
    expect(amountText(null)).toBe('');
  });
});

describe('draftOf and isSameDraft', () => {
  it('turns a saved invoice into form text, and a missing one into a blank unpaid form', () => {
    expect(draftOf(invoice)).toEqual({ invoiceDate: '2026-11-20', invoiceNumber: 'INV-1', amount: '1234.50', paid: true });
    expect(draftOf(undefined)).toEqual({ invoiceDate: '', invoiceNumber: '', amount: '', paid: false });
  });
  it('compares drafts ignoring spaces', () => {
    expect(isSameDraft(draftOf(invoice), { ...draftOf(invoice), invoiceNumber: ' INV-1 ' })).toBe(true);
    expect(isSameDraft(draftOf(invoice), { ...draftOf(invoice), paid: false })).toBe(false);
  });
});

describe('loadSupplierInvoices', () => {
  it('returns the invoices keyed by line id', async () => {
    const f = reply(200, { invoices: { [L]: invoice } });
    expect(await loadSupplierInvoices('5', asFetch(f))).toEqual({ ok: true, invoices: { [L]: invoice } });
    expect(f).toHaveBeenCalledWith('/api/orders/5/supplier-invoices', undefined);
  });
  it('turns a failure into a message, never a throw', async () => {
    expect(await loadSupplierInvoices('5', asFetch(reply(500, null)))).toEqual({ ok: false, message: 'The server answered with status 500.' });
    const down = vi.fn(async () => { throw new Error('offline'); });
    expect(await loadSupplierInvoices('5', asFetch(down))).toEqual({ ok: false, message: 'offline' });
  });
});

describe('saveSupplierInvoice', () => {
  it('posts the line and the form text and returns the saved invoice', async () => {
    const f = reply(200, { ok: true, invoice });
    const res = await saveSupplierInvoice('5', L, { invoiceDate: '2026-11-20', invoiceNumber: 'INV-1', amount: '1234.50', paid: true }, asFetch(f));
    expect(f).toHaveBeenCalledWith('/api/orders/5/supplier-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineId: L, invoiceDate: '2026-11-20', invoiceNumber: 'INV-1', amount: '1234.50', paid: true }) });
    expect(res).toEqual({ ok: true, invoice });
  });
  it('explains refusals in plain words', async () => {
    const say = async (status: number, body: unknown) => (await saveSupplierInvoice('5', L, draftOf(undefined), asFetch(reply(status, body)))) as { ok: false; message: string };
    expect((await say(403, { error: 'staff_not_verified' })).message).toBe('Only a verified staff member can save supplier invoice details.');
    expect((await say(400, { error: 'bad_request' })).message).toBe('Check the date (a real date), the amount (like 125.50) and the invoice number (up to 60 characters).');
    expect((await say(404, { error: 'no_line' })).message).toBe('This line is not on the order any more. Refresh the page.');
    expect((await say(500, null)).message).toBe('The server answered with status 500.');
  });
});
