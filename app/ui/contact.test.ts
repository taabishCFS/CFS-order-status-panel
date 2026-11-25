import { describe, expect, it, vi } from 'vitest';
import type { CustomerBlock } from './orderDetail';
import { addressText, buildContactRequest, contactChanges, formOf, saveContact } from './contact';

const customer = (over: Record<string, unknown> = {}): Extract<CustomerBlock, { restricted: false }> => ({
  restricted: false,
  email: 'a@old.com',
  phone: '0770',
  shipping: [],
  billing: [],
  shippingFields: { name: 'Donna F', address1: '1 High St', address2: '', city: 'Leeds', province: 'West Yorkshire', provinceCode: 'WYK', zip: 'LS1 1AA', country: 'United Kingdom', countryCode: 'GB', phone: '0770' },
  billingFields: null,
  info: { source: null, payment: '', ip: null, customerNote: '' },
  ...over,
});

describe('formOf and addressText', () => {
  it('copies the editable values and prints an address on one line without blanks', () => {
    const f = formOf(customer());
    expect(f).toEqual({ email: 'a@old.com', phone: '0770', name: 'Donna F', address1: '1 High St', address2: '', city: 'Leeds', provinceCode: 'WYK', zip: 'LS1 1AA', countryCode: 'GB' });
    expect(addressText(f)).toBe('Donna F, 1 High St, Leeds, LS1 1AA, GB');
  });
  it('gives a blank form when the order has no shipping address', () => {
    expect(formOf(customer({ shippingFields: null, email: null, phone: null }))).toMatchObject({ email: '', phone: '', address1: '', countryCode: '' });
  });
});

describe('contactChanges', () => {
  it('lists only what differs, with old and new text for the history', () => {
    const before = customer();
    const form = { ...formOf(before), email: 'a@new.com', city: 'York' };
    expect(contactChanges(before, form)).toEqual([
      { label: 'Email', from: 'a@old.com', to: 'a@new.com' },
      { label: 'Shipping address', from: 'Donna F, 1 High St, Leeds, LS1 1AA, GB', to: 'Donna F, 1 High St, York, LS1 1AA, GB' },
    ]);
  });
  it('treats blank-to-blank and spaces-only differences as no change', () => {
    const before = customer();
    expect(contactChanges(before, { ...formOf(before), email: ' a@old.com ' })).toEqual([]);
  });
  it('reports a cleared phone as none', () => {
    const before = customer();
    expect(contactChanges(before, { ...formOf(before), phone: '' })).toEqual([{ label: 'Phone', from: '0770', to: null }]);
  });
});

describe('buildContactRequest', () => {
  it('sends only the parts that changed; an address change sends the whole address with the phone', () => {
    const before = customer();
    expect(buildContactRequest(before, { ...formOf(before), email: 'a@new.com' })).toEqual({ email: 'a@new.com' });
    const body = buildContactRequest(before, { ...formOf(before), zip: 'LS2 2BB' });
    expect(body).toEqual({ shippingAddress: { name: 'Donna F', address1: '1 High St', address2: '', city: 'Leeds', provinceCode: 'WYK', zip: 'LS2 2BB', countryCode: 'GB', phone: '0770' } });
  });
});

describe('saveContact', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  it('posts the request and says ok', async () => {
    const f = reply(200, { ok: true });
    expect(await saveContact('5', { email: 'a@b.co' }, f as unknown as typeof fetch)).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(url).toContain('api/orders/5/contact');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.co' });
  });
  it('turns the backend codes into plain sentences and keeps Shopify\'s own message', async () => {
    expect(await saveContact('5', {}, reply(403, { error: 'staff_not_verified' }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'Only a verified staff member can change contact details.' });
    expect(await saveContact('5', {}, reply(400, { error: 'bad_email' }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'That email address does not look right.' });
    expect(await saveContact('5', {}, reply(400, { error: 'bad_address' }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'The address needs a first line, city, postcode and a two-letter country code (like GB).' });
    expect(await saveContact('5', {}, reply(422, { error: 'shopify_rejected', message: 'Zip is not valid' }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'Shopify did not accept the change: Zip is not valid' });
  });
  it('never throws when the request fails', async () => {
    const down = vi.fn(async () => { throw new Error('network'); });
    expect(await saveContact('5', {}, down as unknown as typeof fetch)).toEqual({ ok: false, message: 'network' });
  });
});
