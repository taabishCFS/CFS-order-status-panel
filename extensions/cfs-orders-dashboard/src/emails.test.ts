import { describe, expect, it, vi } from 'vitest';
import { describeEmail, emailDate, emailOutcomeText, emailRequest, queueEmail, statusEmailInput, templateLabel } from './emails';

const L = (n: number) => `gid://shopify/LineItem/${n}`;
const state = (lines: Record<string, number>) => ({ lines: Object.fromEntries(Object.entries(lines).map(([id, statusId]) => [id, { statusId }])) }) as never;

describe('statusEmailInput', () => {
  it('carries the previous status of the saved lines and the lines in collection status after the save', () => {
    const before = state({ [L(1)]: 4, [L(2)]: 31, [L(3)]: 3 });
    const input = statusEmailInput({ state: before, allLineIds: [L(1), L(2), L(3)], scope: 'lines', lineIds: [L(1), L(3)], statusId: 31 });
    expect(input.lineIds).toEqual([L(1), L(3)]);
    expect(input.previousStatusByLine).toEqual({ [L(1)]: 4, [L(3)]: 3 });
    expect(input.collectionLineIds.sort()).toEqual([L(1), L(2), L(3)]);
  });

  it('uses every line for a whole-order save, and null for a line with no status yet', () => {
    const input = statusEmailInput({ state: state({ [L(1)]: 3 }), allLineIds: [L(1), L(2)], scope: 'order', lineIds: [], statusId: 3 });
    expect(input.lineIds).toEqual([L(1), L(2)]);
    expect(input.previousStatusByLine).toEqual({ [L(1)]: 3, [L(2)]: null });
    expect(input.collectionLineIds).toEqual([]);
  });
});

describe('emailRequest', () => {
  it('builds the body with the numeric order id and the change id as the idempotency key', () => {
    const body = emailRequest({ orderId: 'gid://shopify/Order/123', statusId: 3, lineIds: [L(1)], changeId: 'chg-1' });
    expect(body).toMatchObject({ orderId: '123', statusId: 3, lineIds: [L(1)], idempotencyKey: 'chg-1' });
    expect(body).not.toHaveProperty('templateKey');
  });

  it('a repeat press with the same change id sends the same key', () => {
    const a = emailRequest({ orderId: 'gid://shopify/Order/1', templateKey: 'tracking', lineIds: [], extras: { trackingNumber: 'T' }, changeId: 'same' });
    const b = emailRequest({ orderId: 'gid://shopify/Order/1', templateKey: 'tracking', lineIds: [], extras: { trackingNumber: 'T' }, changeId: 'same' });
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a).toMatchObject({ templateKey: 'tracking', extras: { trackingNumber: 'T' } });
  });
});

describe('queueEmail', () => {
  const call = (result: object) => vi.fn(async () => result as never);

  it('posts the body as JSON and reports success', async () => {
    const fn = call({ ok: true, status: 200, body: { ok: true, rows: [] } });
    expect(await queueEmail({ a: 1 }, fn)).toEqual({ ok: true, recipients: [] });
    expect(fn).toHaveBeenCalledWith('api/emails', expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 1 }) }));
  });

  it('turns a refusal or a network failure into a message', async () => {
    expect((await queueEmail({}, call({ ok: false, status: 409, body: { code: 'email_off' } }))).message).toBe(emailOutcomeText({ code: 'email_off' }));
    const down = vi.fn(async () => { throw new Error('offline'); });
    expect(await queueEmail({}, down)).toEqual({ ok: false, message: emailOutcomeText({ network: true }) });
  });

  it('a send with nothing to send counts as ok', async () => {
    expect(await queueEmail({}, call({ ok: true, status: 200, body: { ok: true, rows: [], code: 'nothing_to_send' } }))).toEqual({ ok: true, recipients: [] });
  });

  it('reports who the customer emails were queued for, not internal copies', async () => {
    const rows = [{ kind: 'customer', recipient: 'a@x.com' }, { kind: 'internal_copy', recipient: 'ops@x.com' }, { kind: 'customer', recipient: null }];
    expect(await queueEmail({}, call({ ok: true, status: 200, body: { ok: true, rows } }))).toEqual({ ok: true, recipients: ['a@x.com'] });
  });
});

describe('emailOutcomeText', () => {
  it('explains the known problems in plain words', () => {
    expect(emailOutcomeText({ code: 'email_off' })).toMatch(/turned off/i);
    expect(emailOutcomeText({ code: 'no_order' })).toMatch(/not been synced|not found/i);
    expect(emailOutcomeText({ code: 'staff_not_verified' })).toMatch(/verified/i);
    expect(emailOutcomeText({ network: true })).toMatch(/reach the backend/i);
    expect(emailOutcomeText({ code: 'something_new' })).toMatch(/something_new/);
  });

  it('flags a row with no customer address', () => {
    expect(emailOutcomeText({ error: 'no_recipient' })).toMatch(/no email address/i);
  });
});

describe('describeEmail and templateLabel', () => {
  const row = { templateKey: 'status.3', recipient: 'jane@example.com', status: 'sent', createdAt: '2026-11-21T10:00:00Z', error: null, kind: 'customer', mode: 'live' };

  it('shows template, time, recipient and status', () => {
    const text = describeEmail(row);
    expect(text).toContain('Order in progress');
    expect(text).toContain('jane@example.com');
    expect(text).toContain('Sent');
    expect(text).toContain('2026');
  });

  it('says a log-mode email was only logged, never sent', () => {
    expect(describeEmail({ ...row, mode: 'log' })).toContain('Logged only (not sent)');
    expect(describeEmail({ ...row, mode: 'log' })).not.toContain('· Sent');
    expect(describeEmail({ ...row, mode: 'test' })).toContain('Sent (test mode)');
    expect(describeEmail({ ...row, mode: 'live' })).toContain('· Sent');
  });

  it('shows the error for a failed email and marks an internal copy', () => {
    expect(describeEmail({ ...row, status: 'failed', error: 'Resend 500' })).toContain('Resend 500');
    expect(describeEmail({ ...row, kind: 'internal_copy' })).toContain('internal copy');
  });

  it('says why a skipped email was skipped, and handles a missing recipient', () => {
    expect(describeEmail({ ...row, status: 'skipped', error: 'no_recipient', recipient: null })).toMatch(/no email address/i);
    expect(describeEmail({ ...row, status: 'skipped', error: 'not_on_allowlist' })).toMatch(/test mode/i);
  });

  it('falls back to the key for an unknown template', () => {
    expect(templateLabel('status.3')).toBe('Order in progress');
    expect(templateLabel('weird.key')).toBe('weird.key');
  });
});

describe('emailDate', () => {
  it('writes an ISO date the way the legacy emails did (30-Nov-2026), and passes anything else through', () => {
    expect(emailDate('2026-11-30')).toBe('30-Nov-2026');
    expect(emailDate('2026-01-05')).toBe('05-Jan-2026');
    expect(emailDate('')).toBe('');
    expect(emailDate('soon')).toBe('soon');
  });
});
