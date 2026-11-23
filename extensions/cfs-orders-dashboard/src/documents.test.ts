import { describe, expect, it, vi } from 'vitest';
import type { StatusState } from '../../cfs-order-status/src/types';
import { deliveryNoteStatus, loadNoteLog, requestDocument, resendInvoice } from './documents';

const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
const state = (over: Record<string, unknown> = {}) => ({ schemaVersion: 2, order: null, lines: { L1: { statusId: 4 }, L2: { statusId: 3 } }, history: [], ...over }) as unknown as StatusState;

describe('deliveryNoteStatus', () => {
  it('is allowed for a paid order with a line in a printable status', () => {
    expect(deliveryNoteStatus({ balanceAmount: '0.00', state: state(), lineIds: ['L1', 'L2'] })).toEqual({ ok: true });
  });
  it('is refused while a balance is owed', () => {
    expect(deliveryNoteStatus({ balanceAmount: '25.00', state: state(), lineIds: ['L1'] })).toMatchObject({ ok: false, reason: expect.stringMatching(/balance/) });
  });
  it('is refused on a 50% or 75% refund condition', () => {
    for (const value of ['50percRefund', '75percRefund']) {
      expect(deliveryNoteStatus({ balanceAmount: null, state: state({ condition: { value, at: 'x', by: {} } }), lineIds: ['L1'] }).ok).toBe(false);
    }
  });
  it('is refused when no line is in a printable status, or the status is unset', () => {
    expect(deliveryNoteStatus({ balanceAmount: '0', state: state(), lineIds: ['L2'] }).ok).toBe(false);
    expect(deliveryNoteStatus({ balanceAmount: '0', state: state(), lineIds: ['L9'] }).ok).toBe(false);
  });
});

describe('requestDocument', () => {
  it('asks for the document and returns the link', async () => {
    const f = reply(200, { url: 'https://app/exports/document?t=1' });
    expect(await requestDocument('5', 'inc-vat', {}, f)).toEqual({ ok: true, url: 'https://app/exports/document?t=1' });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('api/orders/5/document?kind=inc-vat');
  });
  it('sends the ticked lines and type for a return label', async () => {
    const f = reply(200, { url: 'u' });
    await requestDocument('5', 'return-label', { lineIds: ['gid://shopify/LineItem/1', 'gid://shopify/LineItem/2'], type: 'Free_Stock' }, f);
    const url = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(new URLSearchParams(url.split('?')[1]).get('lineIds')).toBe('gid://shopify/LineItem/1,gid://shopify/LineItem/2');
    expect(url).toContain('type=Free_Stock');
  });
  it("explains the server's refusals in plain words", async () => {
    expect(await requestDocument('5', 'delivery-note', {}, reply(422, { error: 'not_allowed', message: 'A balance is still owed on this order.' }))).toEqual({ ok: false, message: 'A balance is still owed on this order.' });
    expect(await requestDocument('5', 'label', {}, reply(403, { error: 'staff_not_verified' }))).toEqual({ ok: false, message: 'Only a verified staff member can print documents.' });
  });
});

describe('loadNoteLog', () => {
  it('returns the log, or the reason it could not be read', async () => {
    expect(await loadNoteLog('5', reply(200, { log: [{ at: '2026-11-22T10:00:00.000Z', by: 'Ann' }] }))).toEqual({ ok: true, log: [{ at: '2026-11-22T10:00:00.000Z', by: 'Ann' }] });
    expect(await loadNoteLog('5', reply(502, { error: 'shopify_unavailable' }))).toMatchObject({ ok: false });
  });
});

describe('resendInvoice', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
  it('gives the recipient when queued', async () => {
    expect(await resendInvoice('5', 'k', reply(200, { ok: true, recipient: 'a@b.co' }))).toEqual({ ok: true, recipient: 'a@b.co' });
  });
  it('explains email off and a missing address', async () => {
    expect(await resendInvoice('5', 'k', reply(409, { error: 'email_off' }))).toMatchObject({ ok: false, message: expect.stringMatching(/switched off/) });
    expect(await resendInvoice('5', 'k', reply(422, { error: 'no_recipient' }))).toMatchObject({ ok: false, message: expect.stringMatching(/no customer email/) });
  });
});
