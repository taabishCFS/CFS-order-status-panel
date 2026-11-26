import { describe, expect, it } from 'vitest';
import { carrierLink, loadCarrier } from './carrierOrders';

const f = { key: 'tnt' as const, q: '', brand: '', van: '', from: '', to: '', page: 1, all: false };
const capture = (body: unknown) => {
  const urls: string[] = [];
  const fetchFn = (async (url: string) => { urls.push(url); return new Response(JSON.stringify(body)); }) as unknown as typeof fetch;
  return { urls, fetchFn };
};

describe('loadCarrier', () => {
  it('sends the page and only the filters that are set', async () => {
    const { urls, fetchFn } = capture({ rows: [], total: 0, page: 1, pageCount: 1, size: 100, vans: [], brands: [] });
    await loadCarrier({ ...f, key: 'allocated', van: 'v1', from: '2026-12-01', page: 2 }, fetchFn);
    expect(urls[0]).toMatch(/\/api\/carrier-orders\?key=allocated&van=v1&from=2026-12-01&page=2$/);
    await loadCarrier({ ...f, all: true }, fetchFn);
    expect(urls[1]).toMatch(/\?key=tnt&all=1$/);
  });
  it('turns a failure into a message', async () => {
    const fetchFn = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    expect(await loadCarrier(f, fetchFn)).toMatchObject({ ok: false });
  });
});

describe('carrierLink', () => {
  it('asks for the export of the same filters', async () => {
    const { urls, fetchFn } = capture({ url: 'https://x/e' });
    expect(await carrierLink({ ...f, key: 'pallet', q: 'ab' }, fetchFn)).toEqual({ ok: true, data: { url: 'https://x/e' } });
    expect(urls[0]).toMatch(/\/api\/delivery-export\?key=pallet&q=ab&kind=carrier$/);
  });
});
