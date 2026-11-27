import { describe, expect, it, vi } from 'vitest';
import { draftBatch, sendBatch, suggestInvoiceNo } from './paySupplier';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('payment batch', () => {
  it('suggests CFSINV with the date and time', () => {
    expect(suggestInvoiceNo(new Date(2026, 10, 27, 9, 5, 7))).toBe('CFSINV-20261127090507');
  });
  it('drafts, and passes on the server message', async () => {
    const draft = { brand: 'Ace', recipients: ['a@x'], lines: [], totalMinor: 0, invoiceNo: 'I1' };
    expect(await draftBatch(['L1'], 'I1', reply(200, draft) as unknown as typeof fetch)).toEqual({ ok: true, data: draft });
    expect(await draftBatch(['L1'], 'I1', reply(422, { error: 'no_email', message: 'There is no email address for Ace.' }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'There is no email address for Ace.' });
  });
  it('sends with the key', async () => {
    const f = reply(200, { brand: 'Ace', recipients: ['a@x'], lines: 1, totalMinor: 100, invoiceNo: 'I1', queued: 1, duplicate: false });
    expect((await sendBatch(['L1'], 'I1', 'key12345', f as unknown as typeof fetch)).ok).toBe(true);
    expect(JSON.parse(String((f.mock.calls[0] as unknown[])[1] && ((f.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ op: 'send', lineIds: ['L1'], invoiceNo: 'I1', idempotencyKey: 'key12345' });
  });
});
