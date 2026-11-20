import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MESSAGE, DEFAULT_SUBJECT, callBulkEmail } from './bulkEmail';

const asFetch = (f: unknown) => f as unknown as typeof fetch;
const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response);
const L = 'gid://shopify/LineItem/1';

describe('callBulkEmail', () => {
  it('posts the lines, subject, message, key and preview flag', async () => {
    const f = reply(200, { ok: true, customers: 2, orders: 3, withoutEmail: 1, recipients: [{ email: 'a@b.c', name: 'A', orders: ['#1'] }] });
    const res = await callBulkEmail({ lineIds: [L], subject: 'S', message: 'M', key: 'k1', dryRun: true }, asFetch(f));
    expect(f).toHaveBeenCalledWith('api/emails/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineIds: [L], subject: 'S', message: 'M', idempotencyKey: 'k1', dryRun: true }) });
    expect(res).toEqual({ ok: true, customers: 2, orders: 3, withoutEmail: 1, recipients: [{ email: 'a@b.c', name: 'A', orders: ['#1'] }] });
  });

  it('explains each refusal in plain words', async () => {
    const say = async (status: number, body: unknown) => (await callBulkEmail({ lineIds: [L], subject: 'S', message: 'M', key: 'k', dryRun: false }, asFetch(reply(status, body)))) as { ok: false; message: string };
    expect((await say(409, { code: 'email_off' })).message).toBe('Email sending is switched off for this app, so nothing was sent.');
    expect((await say(404, { code: 'no_lines' })).message).toBe('The selected lines were not found. Refresh the list and try again.');
    expect((await say(422, { code: 'no_recipients', withoutEmail: 2 })).message).toBe('None of the selected orders has an email address.');
    expect((await say(422, { code: 'bad_subject', errors: ['Unknown placeholder {{x}} in the subject.'] })).message).toBe('The subject cannot be used: Unknown placeholder {{x}} in the subject.');
    expect((await say(403, { error: 'staff_not_verified' })).message).toBe('Only a verified staff member can send bulk email.');
    expect((await say(500, null)).message).toBe('The server answered with status 500.');
  });

  it('turns a network failure into a message, never a throw', async () => {
    const down = vi.fn(async () => { throw new Error('offline'); });
    expect(await callBulkEmail({ lineIds: [L], subject: 'S', message: 'M', key: 'k', dryRun: false }, asFetch(down))).toEqual({ ok: false, message: 'offline' });
  });
});

describe('legacy defaults', () => {
  it('start from the legacy subject and message wording', () => {
    expect(DEFAULT_SUBJECT).toBe('Update on your order {{order_numbers}}');
    expect(DEFAULT_MESSAGE).toContain('Hi {{customer_name}},');
    expect(DEFAULT_MESSAGE).toContain('your order: {{order_numbers}}.');
    expect(DEFAULT_MESSAGE.endsWith('Customer Support')).toBe(true);
  });
});
