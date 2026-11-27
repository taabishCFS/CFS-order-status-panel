import { describe, expect, it } from 'vitest';
import { loadPending, pendingAllLink, pendingLink, pendingSearch } from './balancePending';

const capture = (body: unknown, status = 200) => {
  const urls: string[] = [];
  const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify(body), { status }); }) as typeof fetch;
  return { f, urls };
};

describe('Balance Pending calls', () => {
  it('builds the list query', () => {
    expect(pendingSearch({ page: 1, all: false, status: 0, q: '' })).toBe('');
    expect(pendingSearch({ page: 3, all: false, status: 4, q: ' cfs ' })).toBe('page=3&status=4&q=cfs');
    expect(pendingSearch({ page: 3, all: true, status: 0, q: '' })).toBe('all=1');
  });
  it('loads the list and explains a failure', async () => {
    const ok = capture({ rows: [], total: 0, page: 1, pageCount: 1, size: 50, balanceMinor: 0, paidMinor: 0 });
    expect((await loadPending({ page: 1, all: false, status: 0, q: '' }, ok.f)).ok).toBe(true);
    expect(ok.urls[0]).toContain('/api/balance-pending?');
    const bad = capture({ message: 'nope' }, 500);
    expect(await loadPending({ page: 1, all: false, status: 0, q: '' }, bad.f)).toEqual({ ok: false, message: 'nope' });
  });
  it('asks for the two download links', async () => {
    const c = capture({ url: 'https://x/exports/delivery?t=1' });
    expect((await pendingLink(['gid://shopify/Order/12', 'gid://shopify/Order/34'], 4, c.f)).ok).toBe(true);
    expect(c.urls[0]).toContain('kind=balance-pending&ids=12,34&status=4');
    await pendingAllLink(c.f);
    expect(c.urls[1]).toContain('kind=balance-pending-all');
  });
});
