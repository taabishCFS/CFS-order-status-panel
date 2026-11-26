import { describe, expect, it } from 'vitest';
import { addCollection, deleteCollections, loadCollections } from './supplierCollection';

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('supplier collection calls', () => {
  it('loads a page and builds the page query', async () => {
    const urls: string[] = [];
    const fetchFn = (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ rows: [], total: 0, page: 2, pageCount: 2, brands: [], vans: [] })); }) as unknown as typeof fetch;
    expect((await loadCollections(2, fetchFn)).ok).toBe(true);
    expect(urls[0]).toMatch(/\/api\/supplier-collection\?page=2$/);
  });
  it('explains a duplicate and a missing permission in plain words', async () => {
    expect(await addCollection({ brand: 'A', vanId: 'v', date: '2026-12-01' }, reply({ error: 'duplicate' }, 409))).toEqual({ ok: false, message: 'Error: Duplicate Record Exists.' });
    expect(await deleteCollections(['x'], reply({ error: 'no_permission' }, 403))).toMatchObject({ ok: false });
  });
  it('returns how many were deleted', async () => {
    expect(await deleteCollections(['x'], reply({ ok: true, deleted: 1 }))).toEqual({ ok: true, data: { ok: true, deleted: 1 } });
  });
});
