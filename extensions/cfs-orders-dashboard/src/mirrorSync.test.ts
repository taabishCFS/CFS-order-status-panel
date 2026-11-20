import { describe, expect, it, vi } from 'vitest';
import { runBackfill, syncOrder } from './mirrorSync';

const asFetch = (f: unknown) => f as unknown as typeof fetch;

describe('syncOrder', () => {
  it('posts to the sync route with the numeric order id', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await syncOrder('gid://shopify/Order/123', asFetch(f));
    expect(f).toHaveBeenCalledWith('/api/orders/123/sync', { method: 'POST' });
  });

  it('never throws when the network fails', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    await expect(syncOrder('gid://shopify/Order/123', asFetch(f))).resolves.toBeUndefined();
  });
});

describe('runBackfill', () => {
  const page = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;

  it('repeats with the returned cursor until there are no more pages and adds up the count', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(page({ count: 25, endCursor: 'c1', hasNext: true }))
      .mockResolvedValueOnce(page({ count: 7, endCursor: 'c2', hasNext: false }));
    const seen: number[] = [];
    const res = await runBackfill((n) => seen.push(n), asFetch(f));
    expect(res).toEqual({ ok: true, count: 32 });
    expect(seen).toEqual([25, 32]);
    expect(f.mock.calls[0]).toEqual(['/api/backfill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ after: null }) }]);
    expect(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string)).toEqual({ after: 'c1' });
  });

  it('stops at the first failure and says how many were saved before it', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(page({ count: 25, endCursor: 'c1', hasNext: true }))
      .mockResolvedValueOnce(page({ error: 'boom' }, false, 500));
    expect(await runBackfill(undefined, asFetch(f))).toEqual({ ok: false, message: 'The server answered with status 500', count: 25 });
  });

  it('reports a network failure instead of throwing', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    expect(await runBackfill(undefined, asFetch(f))).toEqual({ ok: false, message: 'offline', count: 0 });
  });
});
