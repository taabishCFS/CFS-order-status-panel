import { describe, expect, it } from 'vitest';
import { loadMaxpro, maxproLink, numericId } from './maxpro';

const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('loadMaxpro', () => {
  it('asks for the filters that are set', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => { urls.push(url); return new Response(JSON.stringify({ rows: [], total: 0, page: 1, pageCount: 1, size: 100, brands: [] })); }) as unknown as typeof fetch;
    await loadMaxpro({ q: 'ab', brand: 'Acme', whiteGlove: true, all: false, page: 2 }, fetchFn);
    expect(urls[0]).toMatch(/\/api\/maxpro\?q=ab&brand=Acme&wg=1&page=2$/);
    await loadMaxpro({ q: '', brand: '', whiteGlove: false, all: true, page: 3 }, fetchFn);
    expect(urls[1]).toMatch(/\/api\/maxpro\?all=1$/);
  });
  it('turns a failure into a message', async () => {
    expect(await loadMaxpro({ q: '', brand: '', whiteGlove: false, all: false, page: 1 }, answer(500, {}))).toMatchObject({ ok: false });
  });
});

describe('maxproLink', () => {
  it('asks for a link with the numeric order ids', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => { urls.push(url); return new Response(JSON.stringify({ url: 'https://x/e' })); }) as unknown as typeof fetch;
    expect(await maxproLink('maxpro-order', ['gid://shopify/Order/1', 'gid://shopify/Order/2'], fetchFn)).toEqual({ ok: true, data: { url: 'https://x/e' } });
    expect(urls[0]).toMatch(/kind=maxpro-order&ids=1%2C2$/);
  });
  it('needs ticked orders, and not too many', async () => {
    expect(await maxproLink('maxpro-product', [])).toMatchObject({ ok: false, message: 'Please Select Record(s) to Export.' });
    expect(await maxproLink('maxpro-product', Array.from({ length: 501 }, (_, i) => `gid://shopify/Order/${i}`))).toMatchObject({ ok: false });
  });
  it('numericId', () => expect(numericId('gid://shopify/Order/77')).toBe('77'));
});
