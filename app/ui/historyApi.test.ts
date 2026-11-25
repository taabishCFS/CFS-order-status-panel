import { describe, expect, it, vi } from 'vitest';
import { archiveViaServer, loadOlderViaServer } from './historyApi';

const f = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
const e = { id: 'e1' } as never;

describe('archiveViaServer', () => {
  it('posts the entries to the order\'s history address', async () => {
    const fetchFn = f(200, { ok: true });
    expect(await archiveViaServer('gid://shopify/Order/5', [e], fetchFn)).toEqual({ ok: true });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/orders/5/history');
    expect(JSON.parse(init.body)).toEqual({ entries: [e] });
  });
  it('returns the server\'s reason, or the status when it gave none', async () => {
    expect(await archiveViaServer('gid://shopify/Order/5', [e], f(502, { message: 'no' }))).toEqual({ ok: false, message: 'no' });
    expect(await archiveViaServer('gid://shopify/Order/5', [e], f(500, null))).toEqual({ ok: false, message: 'The server answered with status 500.' });
  });
  it('turns a network failure into a refusal', async () => {
    const down = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await archiveViaServer('gid://shopify/Order/5', [e], down)).toEqual({ ok: false, message: 'offline' });
  });
});

describe('loadOlderViaServer', () => {
  it('asks for the page after a cursor and returns it', async () => {
    const page = { entries: [], endCursor: 'c2', hasNextPage: true };
    const fetchFn = f(200, page);
    expect(await loadOlderViaServer('gid://shopify/Order/5', { after: 'c 1' }, fetchFn)).toEqual(page);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/orders/5/history?after=c%201');
  });
  it('throws the reason when it cannot read', async () => {
    await expect(loadOlderViaServer('gid://shopify/Order/5', {}, f(404, { error: 'not_found' }))).rejects.toThrow('status 404');
  });
});
