import { describe, expect, it } from 'vitest';
import { loadReturned, markReturned, returnedQuery } from './returnedItems';

const reply = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (u: RequestInfo | URL, init?: RequestInit) => { seen.url = String(u); seen.init = init; return new Response(JSON.stringify(body), { status }); }) as typeof fetch;

describe('Returned Items calls', () => {
  it('builds the query', () => {
    expect(returnedQuery(1, '')).toBe('');
    expect(returnedQuery(3, ' 1038 ')).toBe('page=3&q=1038');
  });
  it('loads a page', async () => {
    const seen: { url?: string } = {};
    expect((await loadReturned(2, '', reply(200, { rows: [], total: 0, page: 1, pageCount: 1, size: 50 }, seen))).ok).toBe(true);
    expect(seen.url).toContain('/api/returned-items?page=2');
  });
  it('marks ticked items and explains a refusal', async () => {
    const seen: { init?: RequestInit } = {};
    expect(await markReturned(['L1'], 'Dispose', reply(200, { ok: true, marked: 1, skipped: 0 }, seen))).toEqual({ ok: true, data: { marked: 1, skipped: 0 } });
    expect(JSON.parse(String(seen.init?.body))).toEqual({ lineIds: ['L1'], action: 'Dispose' });
    expect(await markReturned(['L1'], 'Dispose', reply(403, { error: 'staff_not_verified' }))).toEqual({ ok: false, message: 'Only a verified staff member can mark returned items.' });
  });
});
