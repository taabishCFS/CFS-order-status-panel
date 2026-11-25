import { describe, expect, it } from 'vitest';
import { SBTS_TYPES, loadFreeStock, markCollected, removeMany, removedText, typeLabel } from './freeStock';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SBTS and display helpers', () => {
  it('names the types in plain words', () => {
    expect(typeLabel('SBTS')).toBe('Send Back To Supplier');
    expect(typeLabel('Display')).toBe('Display');
    expect(typeLabel('Other')).toBe('Other');
    expect(SBTS_TYPES.map((t) => t.value)).toEqual(['SBTS', 'Display']);
  });
  it('says what a bulk remove did', () => {
    expect(removedText(1, 0)).toBe('Removed 1 item.');
    expect(removedText(3, 0)).toBe('Removed 3 items.');
    expect(removedText(2, 1)).toContain('1 given to an order was kept');
    expect(removedText(0, 2)).toContain('2 given to an order were kept');
  });
});

describe('talking to the server', () => {
  it('asks for the other group, one brand and one type', async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return reply(200, { items: [], total: 0, page: 1, pageCount: 1, itemTypes: [] })(); }) as typeof fetch;
    expect((await loadFreeStock({ group: 'other', brand: 'Actona', type: 'SBTS' }, f)).ok).toBe(true);
    expect(urls[0]).toContain('group=other');
    expect(urls[0]).toContain('brand=Actona');
    expect(urls[0]).toContain('type=SBTS');
  });
  it('marks collected and removes several, sending the ids', async () => {
    const bodies: unknown[] = [];
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return reply(200, { ok: true, changed: 2, removed: 2, kept: 1 })(); }) as typeof fetch;
    expect(await markCollected(['a', 'b'], true, f)).toEqual({ ok: true, changed: 2 });
    expect(await removeMany(['a', 'b', 'c'], f)).toEqual({ ok: true, removed: 2, kept: 1 });
    expect(bodies).toEqual([{ ids: ['a', 'b'], collected: true }, { ids: ['a', 'b', 'c'], removeMany: true }]);
  });
  it('turns failures into a message', async () => {
    expect(await markCollected(['a'], true, reply(403, { error: 'staff_not_verified' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('verified staff') });
    expect(await removeMany(['a'], reply(400, { error: 'bad_request' }) as typeof fetch)).toMatchObject({ ok: false });
  });
});
