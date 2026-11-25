import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../cfs-order-status/src/identity';
import { callProcess, groupProcessed, loadChase, loadChaseExport, loadSuppliers, processOrder, processText, saveSupplier, type ProcessReply } from './supplierChase';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
const actor: Actor = { id: '9', name: 'Sam', source: 'staff-member' };
const base: ProcessReply = { emails: 2, orders: 2, handOrdered: 1, noSupplier: [], skipped: 0, processedLines: [{ lineId: 'l1', orderId: 'o1' }, { lineId: 'l2', orderId: 'o1' }, { lineId: 'l3', orderId: 'o2' }] };

describe('loading', () => {
  it('asks for the list with the kind, brand and dates', async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify({ rows: [], summary: { lines: 0, orders: 0 }, total: 0, page: 1, pageCount: 1, capped: false, brands: [] }), { status: 200 }); }) as typeof fetch;
    expect((await loadChase({ kind: 'lapsed', brand: 'Actona', from: '2026-11-01', to: '2026-11-20', page: 2 }, f)).ok).toBe(true);
    expect(urls[0]).toContain('kind=lapsed');
    expect(urls[0]).toContain('brand=Actona');
    expect(urls[0]).toContain('from=2026-11-01');
    expect(urls[0]).toContain('page=2');
  });
  it('asks for the export link of the same list', async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify({ url: 'https://x/e?t=1', filename: 'date-lapsed.csv' }), { status: 200 }); }) as typeof fetch;
    expect(await loadChaseExport({ kind: 'lapsed', brand: 'A', page: 3 }, f)).toEqual({ ok: true, data: { url: 'https://x/e?t=1', filename: 'date-lapsed.csv' } });
    expect(urls[0]).toContain('export=1');
    expect(urls[0]).not.toContain('page=');
  });
  it('turns failures into words', async () => {
    expect(await loadChase({ kind: 'chaseup' }, reply(500, {}))).toMatchObject({ ok: false, message: expect.stringContaining('status 500') });
    expect(await saveSupplier({ brand: 'A', email: 'x', cc: '', handOrdered: false }, reply(400, { error: 'bad_email' }))).toMatchObject({ ok: false, message: expect.stringContaining('not valid') });
    expect(await loadSuppliers(reply(200, { suppliers: [{ brand: 'A', email: '', cc: '', handOrdered: false }] }))).toMatchObject({ ok: true });
    expect(await callProcess({ action: 'order', lineIds: ['l'], key: 'k', dryRun: false }, reply(403, { error: 'no_permission' }))).toMatchObject({ ok: false, message: expect.stringContaining('permission') });
    expect(await callProcess({ action: 'order', lineIds: ['l'], key: 'k', dryRun: false }, reply(409, { ok: false, code: 'email_off' }))).toMatchObject({ ok: false, message: expect.stringContaining('switched off') });
  });
  it('sends whole orders or lines, never both', async () => {
    const bodies: unknown[] = [];
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(base), { status: 200 }); }) as typeof fetch;
    await callProcess({ action: 'order', orderIds: ['o1'], key: 'k', dryRun: true }, f);
    await callProcess({ action: 'chaseup', lineIds: ['l1'], key: 'k', dryRun: false }, f);
    expect(bodies).toEqual([{ action: 'order', orderIds: ['o1'], idempotencyKey: 'k', dryRun: true }, { action: 'chaseup', lineIds: ['l1'], idempotencyKey: 'k', dryRun: false }]);
  });
});

describe('words', () => {
  it('groups processed lines by order', () => {
    expect([...groupProcessed(base.processedLines)]).toEqual([['o1', ['l1', 'l2']], ['o2', ['l3']]]);
  });
  it('says what happened', () => {
    expect(processText('order', base)).toBe('2 order forms emailed to suppliers. 1 line for brands ordered by hand (no email).');
    expect(processText('order', { ...base, emails: 1, handOrdered: 0, noSupplier: ['Nobody'], skipped: 2 }, 1)).toContain('nothing sent for Nobody');
    expect(processText('order', { ...base, emails: 1, handOrdered: 0 }, 1)).toContain('1 order could not be set to Order in Progress');
    expect(processText('chaseup', { ...base, emails: 1 })).toBe('1 chase-up email sent to suppliers.');
    expect(processText('order', { ...base, emails: 0, handOrdered: 0 })).toBe('Nothing to send.');
  });
});

describe('processOrder', () => {
  it('emails first, then sets only what was processed to Order in Progress', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: base }));
    const bulk = vi.fn(async () => ({ saved: ['o1', 'o2'], failed: [] }));
    const r = await processOrder({ lineIds: ['l1'], actor, key: 'k' }, { call, bulk });
    expect(r).toEqual({ ok: true, tone: 'success', text: '2 order forms emailed to suppliers. 1 line for brands ordered by hand (no email).' });
    const arg = bulk.mock.calls[0][0] as unknown as { groups: Map<string, string[]>; status: { id: number } };
    expect([...arg.groups]).toEqual([['o1', ['l1', 'l2']], ['o2', ['l3']]]);
    expect(arg.status.id).toBe(3);
  });
  it('changes no status when the email step fails', async () => {
    const bulk = vi.fn();
    const r = await processOrder({ lineIds: ['l1'], actor, key: 'k' }, { call: async () => ({ ok: false as const, message: 'no' }), bulk });
    expect(r).toEqual({ ok: false, message: 'no' });
    expect(bulk).not.toHaveBeenCalled();
  });
  it('warns when some orders could not be set', async () => {
    const r = await processOrder({ lineIds: ['l1'], actor, key: 'k' }, { call: async () => ({ ok: true as const, data: base }), bulk: async () => ({ saved: ['o1'], failed: [{ orderId: 'o2', message: 'stale' }] }) });
    expect(r).toMatchObject({ ok: true, tone: 'warning' });
  });
  it('does not touch statuses when nothing was processed', async () => {
    const bulk = vi.fn();
    const r = await processOrder({ lineIds: ['l1'], actor, key: 'k' }, { call: async () => ({ ok: true as const, data: { ...base, emails: 0, handOrdered: 0, noSupplier: ['X'], processedLines: [] } }), bulk });
    expect(bulk).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, tone: 'warning' });
  });
});
