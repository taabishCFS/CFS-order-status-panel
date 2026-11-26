import { describe, expect, it } from 'vitest';
import { addArea, deleteAreas, loadAreas, setAreasStatus } from './areas';

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('area calls', () => {
  it('loads a page and builds the page query', async () => {
    const urls: string[] = [];
    const fetchFn = (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ rows: [], total: 0, page: 2, pageCount: 2 })); }) as unknown as typeof fetch;
    expect((await loadAreas(2, fetchFn)).ok).toBe(true);
    expect(urls[0]).toMatch(/\/api\/areas\?page=2$/);
  });
  it('explains problems in plain words', async () => {
    expect(await addArea({ name: 'A', postcodes: '', active: true }, reply({ error: 'duplicate' }, 409))).toEqual({ ok: false, message: 'Error: Duplicate Record Exists.' });
    expect(await setAreasStatus(['x'], true, reply({ error: 'no_permission' }, 403))).toMatchObject({ ok: false });
  });
  it('returns the counts', async () => {
    expect(await deleteAreas(['x'], reply({ ok: true, deleted: 1 }))).toEqual({ ok: true, data: { ok: true, deleted: 1 } });
  });
});
