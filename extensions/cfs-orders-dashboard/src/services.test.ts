import { describe, expect, it, vi } from 'vitest';
import { draftOf, historyChanges, loadServices, requestOf, saveServices } from './services';

const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
const two = { key: 'two_man', label: 'Two Man Delivery', amountMinor: 5000 };
const none = { key: 'scotland', label: 'Scotland Delivery', amountMinor: null };

describe('draftOf', () => {
  it('ticks and fills the amount for a service on the order, and leaves the rest blank and unticked', () => {
    expect(draftOf(two)).toEqual({ on: true, amount: '50.00' });
    expect(draftOf(none)).toEqual({ on: false, amount: '' });
  });
});

describe('requestOf', () => {
  it('sends the amount for a ticked service and a blank for an unticked one', () => {
    const r = requestOf([two, none], { two_man: { on: true, amount: '60' }, scotland: { on: false, amount: '25' } });
    expect(r).toEqual({ ok: true, services: { two_man: '60', scotland: '' } });
  });
  it('refuses a ticked service with no amount, naming it', () => {
    expect(requestOf([two, none], { two_man: { on: true, amount: '50.00' }, scotland: { on: true, amount: ' ' } })).toEqual({ ok: false, message: 'Enter an amount for Scotland Delivery, or untick it.' });
  });
});

describe('historyChanges', () => {
  it('turns pence into pounds text for the history', () => {
    expect(historyChanges([{ key: 'two_man', label: 'Two Man Delivery', from: null, to: 6000 }, { key: 'scotland', label: 'Scotland Delivery', from: 2500, to: null }])).toEqual([
      { label: 'Two Man Delivery', from: null, to: '£60.00' },
      { label: 'Scotland Delivery', from: '£25.00', to: null },
    ]);
  });
});

describe('loadServices', () => {
  it('returns the services and the currency', async () => {
    expect(await loadServices('5', reply(200, { currency: 'GBP', services: [two] }))).toEqual({ ok: true, currency: 'GBP', services: [two] });
  });
  it('says why it failed, never throwing', async () => {
    expect(await loadServices('5', reply(502, { error: 'shopify_unavailable' }))).toEqual({ ok: false, message: 'Shopify could not be read just now. Try again shortly.' });
    const down = vi.fn(async () => { throw new Error('network'); });
    expect(await loadServices('5', down as unknown as typeof fetch)).toEqual({ ok: false, message: 'network' });
  });
});

describe('saveServices', () => {
  it('posts the request and returns what changed', async () => {
    const f = reply(200, { ok: true, changed: true, changes: [{ key: 'two_man', label: 'Two Man Delivery', from: null, to: 6000 }] });
    const r = await saveServices('5', { two_man: '60' }, f);
    expect(r).toEqual({ ok: true, changed: true, changes: [{ key: 'two_man', label: 'Two Man Delivery', from: null, to: 6000 }] });
    const [url, init] = (f as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0];
    expect(url).toContain('api/orders/5/services');
    expect(JSON.parse(init.body)).toEqual({ services: { two_man: '60' } });
  });
  it('turns each refusal into a plain sentence', async () => {
    expect(await saveServices('5', {}, reply(403, { error: 'staff_not_verified' }))).toEqual({ ok: false, message: 'Only a verified staff member can change delivery and services.' });
    expect(await saveServices('5', {}, reply(400, { error: 'bad_amount' }))).toEqual({ ok: false, message: 'Enter each amount in pounds and pence, like 60.00, above zero.' });
    expect(await saveServices('5', {}, reply(422, { error: 'shopify_rejected', message: 'Cannot edit a cancelled order' }))).toEqual({ ok: false, message: 'Shopify did not accept the change: Cannot edit a cancelled order' });
  });
});
