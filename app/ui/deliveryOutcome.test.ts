import { describe, expect, it } from 'vitest';
import { dmy, loadOutcome, outcomeLink } from './deliveryOutcome';

const f = { kind: 'completed' as const, q: '', brand: '', van: '', pay: '', from: '', to: '', page: 1, all: false };
const capture = (body: unknown) => {
  const urls: string[] = [];
  const fetchFn = (async (url: string) => { urls.push(url); return new Response(JSON.stringify(body)); }) as unknown as typeof fetch;
  return { urls, fetchFn };
};

describe('loadOutcome', () => {
  it('sends only the filters that are set', async () => {
    const { urls, fetchFn } = capture({ rows: [], total: 0, page: 1, pageCount: 1, size: 100, vans: [], payModes: [], brands: [] });
    await loadOutcome({ ...f, from: '2026-11-25', to: '2026-11-25', van: 'partner:TNT', page: 2 }, fetchFn);
    expect(urls[0]).toMatch(/\/api\/delivery-outcome\?kind=completed&van=partner%3ATNT&from=2026-11-25&to=2026-11-25&page=2$/);
    await loadOutcome({ ...f, kind: 'failed', all: true }, fetchFn);
    expect(urls[1]).toMatch(/\?kind=failed&all=1$/);
  });
  it('turns a failure into a message', async () => {
    const fetchFn = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    expect(await loadOutcome(f, fetchFn)).toMatchObject({ ok: false });
  });
});

describe('outcomeLink', () => {
  it('asks for the export of the same filters', async () => {
    const { urls, fetchFn } = capture({ url: 'https://x/e' });
    expect(await outcomeLink({ ...f, kind: 'failed', q: 'ab' }, fetchFn)).toEqual({ ok: true, data: { url: 'https://x/e' } });
    expect(urls[0]).toMatch(/\/api\/delivery-export\?kind=outcome-failed&q=ab$/);
  });
});

it('dmy', () => {
  expect(dmy('2026-11-25')).toBe('25/11/2026');
  expect(dmy(null)).toBe('');
});
