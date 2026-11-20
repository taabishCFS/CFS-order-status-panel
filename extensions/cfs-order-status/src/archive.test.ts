import { describe, expect, it, vi } from 'vitest';
import { archiveEntries, entryHandle, loadOlderHistory, RECENT_LIMIT, splitHistory } from './archive';
import type { HistoryEntry } from './types';

const ORDER = 'gid://shopify/Order/8381987455315';
const asFetch = (f: unknown) => f as unknown as typeof fetch;
const reply = (body: unknown) => vi.fn(async () => ({ json: async () => body }) as Response);
const sent = (f: ReturnType<typeof vi.fn>, n = 0) => JSON.parse((f.mock.calls[n] as unknown[])[1] ? ((f.mock.calls[n] as unknown[])[1] as { body: string }).body : '{}');

const entry = (id: string, at = '2026-11-18T10:00:00Z'): HistoryEntry => ({
  id,
  at,
  by: { id: 'gid://shopify/StaffMember/1', name: 'Sam Patel', source: 'staff-member' },
  scope: 'order',
  changes: [{ target: 'order', fromId: null, toId: 46, toLabel: 'Collection/Display Stock' }],
});
const many = (n: number) => Array.from({ length: n }, (_, i) => entry(`e${i}`));

describe('entryHandle', () => {
  it('uses only lowercase letters, digits and hyphens', () => {
    expect(entryHandle(ORDER, 'ABC.def 123_x')).toMatch(/^[a-z0-9-]+$/);
  });

  it('differs between two orders with the same entry id', () => {
    expect(entryHandle('gid://shopify/Order/1', 'e1')).not.toBe(entryHandle('gid://shopify/Order/2', 'e1'));
  });

  it('is stable for repeated calls', () => {
    expect(entryHandle(ORDER, '1763-abc')).toBe(entryHandle(ORDER, '1763-abc'));
  });
});

describe('splitHistory', () => {
  it('keeps everything in recent when under the limit', () => {
    const h = many(3);
    expect(splitHistory(h)).toEqual({ recent: h, trimmed: [] });
  });

  it('keeps the newest 20 in order and trims the oldest', () => {
    const h = many(25);
    const { recent, trimmed } = splitHistory(h);
    expect(RECENT_LIMIT).toBe(20);
    expect(recent.map((e) => e.id)).toEqual(h.slice(5).map((e) => e.id));
    expect(trimmed.map((e) => e.id)).toEqual(h.slice(0, 5).map((e) => e.id));
  });

  it('honours a custom limit', () => {
    const { recent, trimmed } = splitHistory(many(5), 2);
    expect(recent).toHaveLength(2);
    expect(trimmed).toHaveLength(3);
  });
});

const upsertOk = { data: { metaobjectUpsert: { metaobject: { id: 'gid://shopify/Metaobject/1' }, userErrors: [] } } };

describe('archiveEntries', () => {
  it('sends one upsert per entry with a handle from entryHandle and the full order id', async () => {
    const f = reply(upsertOk);
    const es = [entry('e1'), entry('e2')];
    expect(await archiveEntries(ORDER, es, asFetch(f))).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
    const v = sent(f, 0).variables;
    expect(v.h).toEqual({ type: '$app:cfs_status_history', handle: entryHandle(ORDER, 'e1') });
    const fields = Object.fromEntries(v.m.fields.map((x: { key: string; value: string }) => [x.key, x.value]));
    expect(fields).toMatchObject({ order_id: ORDER, entry_id: 'e1', actor_name: 'Sam Patel' });
    expect(JSON.parse(fields.payload)).toEqual(es[0]);
  });

  it('does not call Shopify for an empty list', async () => {
    const f = reply(upsertOk);
    expect(await archiveEntries(ORDER, [], asFetch(f))).toEqual({ ok: true });
    expect(f).not.toHaveBeenCalled();
  });

  it('stops at the first user error and reports it', async () => {
    const f = reply({ data: { metaobjectUpsert: { metaobject: null, userErrors: [{ code: 'X', message: 'Nope' }] } } });
    const result = await archiveEntries(ORDER, [entry('e1'), entry('e2')], asFetch(f));
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toMatch(/Nope/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('reports a GraphQL error', async () => {
    const f = reply({ errors: [{ message: 'Access denied' }] });
    expect(await archiveEntries(ORDER, [entry('e1')], asFetch(f))).toMatchObject({ ok: false });
  });

  it('reports a thrown fetch without throwing', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    expect(await archiveEntries(ORDER, [entry('e1')], asFetch(f))).toEqual({ ok: false, message: 'offline' });
  });
});

const page = (entries: HistoryEntry[], hasNextPage = false, endCursor: string | null = null) => ({
  data: { metaobjects: { nodes: entries.map((e) => ({ fields: [{ key: 'payload', value: JSON.stringify(e) }] })), pageInfo: { hasNextPage, endCursor } } },
});

describe('loadOlderHistory', () => {
  it('parses stored payloads into entries and returns the paging info', async () => {
    const es = [entry('e9'), entry('e8')];
    const f = reply(page(es, true, 'CUR1'));
    expect(await loadOlderHistory(ORDER, {}, asFetch(f))).toEqual({ entries: es, endCursor: 'CUR1', hasNextPage: true });
  });

  it('filters by order, newest first, and passes the cursor and page size', async () => {
    const f = reply(page([]));
    await loadOlderHistory(ORDER, { after: 'CUR0', first: 5 }, asFetch(f));
    const b = sent(f);
    expect(b.query).toContain('$app:cfs_status_history');
    // Creation order equals history order; re-archiving an entry must not move it in the list.
    expect(b.query).toContain('sortKey: "id"');
    expect(b.query).not.toMatch(/updated_at/);
    expect(b.query).toContain('reverse: true');
    expect(JSON.stringify(b.variables)).toContain(ORDER);
    expect(b.variables.after).toBe('CUR0');
    expect(b.variables.first).toBe(5);
  });

  it('skips archived items whose payload is not a valid history entry instead of breaking the list', async () => {
    const good = entry('e9');
    const body = page([good]);
    const nodes = body.data.metaobjects.nodes as { fields: { key: string; value: string }[] }[];
    nodes.unshift({ fields: [{ key: 'payload', value: '{"n":"e2"}' }] });
    nodes.unshift({ fields: [{ key: 'payload', value: 'not json' }] });
    nodes.unshift({ fields: [{ key: 'entry_id', value: 'no-payload' }] });
    const f = reply(body);
    expect((await loadOlderHistory(ORDER, {}, asFetch(f))).entries).toEqual([good]);
  });

  it('returns archived entries of the newer types (note, delivery) and still skips an unknown scope', async () => {
    const note: HistoryEntry = { ...entry('n1'), scope: 'note', changes: [], note: 'Called customer' };
    const delivery: HistoryEntry = {
      ...entry('d1'),
      scope: 'delivery',
      changes: [],
      values: [{ target: 'gid://shopify/LineItem/1', from: null, to: 'confirmed' }],
    };
    const configuration: HistoryEntry = { ...entry('c1'), scope: 'configuration', changes: [], values: [{ target: 'gid://shopify/LineItem/1', from: 'a', to: 'b' }], note: 'n' };
    const bogus = { ...entry('b1'), scope: 'bogus' } as unknown as HistoryEntry;
    const f = reply(page([note, bogus, delivery, configuration]));
    expect((await loadOlderHistory(ORDER, {}, asFetch(f))).entries).toEqual([note, delivery, configuration]);
  });

  it('throws the GraphQL error message', async () => {
    const f = reply({ errors: [{ message: 'Boom' }] });
    await expect(loadOlderHistory(ORDER, {}, asFetch(f))).rejects.toThrow('Boom');
  });
});
