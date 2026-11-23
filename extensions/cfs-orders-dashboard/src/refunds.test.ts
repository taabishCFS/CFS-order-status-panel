import { describe, expect, it, vi } from 'vitest';
import { addRefund, fullRefundMinor, loadRefunds, moneyText, reasonLabel, refundSummary } from './refunds';

const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
const form = { clientKey: 'k1', reason: 'DamagedPartRefund', type: 'part' as const, amount: '25', lineIds: [], notes: 'x' };

describe('text helpers', () => {
  it('shows pence as pounds, names a reason and summarises a request', () => {
    expect(moneyText(2500)).toBe('25.00');
    expect(moneyText(125050)).toBe('1250.50');
    expect(reasonLabel('DamagedPartRefund')).toBe('Damaged Part Refund');
    expect(reasonLabel('Unknown_code')).toBe('Unknown_code');
    expect(refundSummary('part', 2500, 'DamagedPartRefund')).toBe('Part refund £25.00: Damaged Part Refund');
    expect(refundSummary('full', 1000, 'Discontinued')).toBe('Full refund £10.00: Discontinued');
  });
});

describe('loadRefunds', () => {
  it('returns the requests and what is still refundable', async () => {
    const r = await loadRefunds('5', reply(200, { requests: [{ id: 'r1' }], refundableMinor: 5000 }));
    expect(r).toEqual({ ok: true, requests: [{ id: 'r1' }], refundableMinor: 5000 });
  });
  it('says why it failed, never throwing', async () => {
    expect(await loadRefunds('5', reply(500, null))).toEqual({ ok: false, message: 'The server answered with status 500.' });
    const down = vi.fn(async () => { throw new Error('network'); });
    expect(await loadRefunds('5', down as unknown as typeof fetch)).toEqual({ ok: false, message: 'network' });
  });
});

describe('addRefund', () => {
  it('posts the form and returns the request', async () => {
    const f = reply(200, { ok: true, request: { id: 'r1' } });
    expect(await addRefund('5', form, f)).toEqual({ ok: true, request: { id: 'r1' } });
    const [url, init] = (f as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0];
    expect(url).toContain('api/orders/5/refunds');
    expect(JSON.parse(init.body)).toEqual(form);
  });
  it('turns each refusal into a plain sentence, including how much can still be refunded', async () => {
    expect(await addRefund('5', form, reply(422, { error: 'too_much', refundableMinor: 1000 }))).toEqual({ ok: false, message: 'That is more than can still be refunded on this order (£10.00 left).' });
    expect(await addRefund('5', form, reply(403, { error: 'staff_not_verified' }))).toEqual({ ok: false, message: 'Only a verified staff member can add a refund.' });
    expect(await addRefund('5', form, reply(400, { error: 'bad_amount' }))).toEqual({ ok: false, message: 'Enter the amount in pounds and pence, like 25.50. A part refund needs an amount.' });
    expect(await addRefund('5', form, reply(400, { error: 'bad_reason' }))).toEqual({ ok: false, message: 'Choose a reason.' });
    expect(await addRefund('5', form, reply(404, { error: 'no_order' }))).toEqual({ ok: false, message: 'This order has not reached the app yet. Try again shortly, or press Refresh order data.' });
  });
});

describe('fullRefundMinor', () => {
  const lines = [{ id: 'A', final: { amount: '109.99' } }, { id: 'B', final: { amount: '20.00' } }, { id: 'C', final: null }];
  it('adds up the ticked products at their final price', () => {
    expect(fullRefundMinor(lines, ['A', 'B'], 100000)).toBe(12999);
  });
  it('is everything still refundable when no product is ticked', () => {
    expect(fullRefundMinor(lines, [], 230398)).toBe(230398);
  });
  it('never goes above what is still refundable', () => {
    expect(fullRefundMinor(lines, ['A'], 5000)).toBe(5000);
  });
  it('gives null when a ticked product has no reliable final price or is gone', () => {
    expect(fullRefundMinor(lines, ['A', 'C'], 100000)).toBeNull();
    expect(fullRefundMinor(lines, ['Z'], 100000)).toBeNull();
  });
});
