import { describe, expect, it } from 'vitest';
import { addCaller, feedbackLink, feedbackSearch, loadFeedback, saveCall, shareOutCalls } from './feedbackCalling';

const reply = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (u: RequestInfo | URL, init?: RequestInit) => { seen.url = String(u); seen.init = init; return new Response(JSON.stringify(body), { status }); }) as typeof fetch;
const Q = { from: '2026-11-20', to: '2026-11-21', q: '', staff: 'Vinod', page: 2, all: false };

describe('Feedback Calling calls', () => {
  it('builds the query', () => {
    expect(feedbackSearch(Q)).toBe('from=2026-11-20&to=2026-11-21&staff=Vinod&page=2');
    expect(feedbackSearch({ ...Q, staff: '', all: true })).toBe('from=2026-11-20&to=2026-11-21&all=1');
  });
  it('loads, saves, shares out and adds a caller', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    expect((await loadFeedback(Q, reply(200, { rows: [], total: 0, callers: [] }, seen))).ok).toBe(true);
    expect(seen.url).toContain('/api/feedback-calling?from=2026-11-20');
    expect(await saveCall('gid://shopify/Order/1', 'remark', 'ok', reply(200, { ok: true }, seen))).toEqual({ ok: true, data: true });
    expect(JSON.parse(String(seen.init?.body))).toEqual({ orderId: 'gid://shopify/Order/1', field: 'remark', value: 'ok' });
    expect(await saveCall('gid://shopify/Order/1', 'staff', 'X', reply(400, { error: 'bad_staff' }))).toEqual({ ok: false, message: 'Choose a caller from the list.' });
    expect(await shareOutCalls(Q, reply(200, { ok: true, assigned: 3 }, seen))).toEqual({ ok: true, data: 3 });
    expect(JSON.parse(String(seen.init?.body))).toEqual({ shareOut: { from: '2026-11-20', to: '2026-11-21', q: '' } });
    expect(await addCaller('Sam', reply(400, { error: 'exists' }))).toEqual({ ok: false, message: 'That caller is already on the list.' });
  });
  it('asks for the CSV link with the filter', async () => {
    const seen: { url?: string } = {};
    await feedbackLink(Q, reply(200, { url: 'https://x' }, seen));
    expect(seen.url).toContain('/api/delivery-export?from=2026-11-20&to=2026-11-21&staff=Vinod&kind=feedback-calling');
  });
});
