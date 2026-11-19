import { describe, expect, it, vi } from 'vitest';
import { loadState, saveState } from './store';
import { applyChange, emptyState } from './state';

const ORDER = 'gid://shopify/Order/1036';
const reply = (body: unknown) => vi.fn(async () => ({ json: async () => body }) as Response);
const sentBody = (fn: ReturnType<typeof reply>) => JSON.parse((fn.mock.calls[0] as unknown[])[1] ? ((fn.mock.calls[0] as unknown[])[1] as { body: string }).body : '{}');

const saved = applyChange(emptyState(), {
  scope: 'order',
  lineIds: [],
  status: { id: 46, label: 'Collection/Display Stock' },
  actor: { id: null, name: 'Sam', source: 'self-declared' },
  now: '2026-11-18T10:00:00Z',
  entryId: 'e1',
});

describe('loadState', () => {
  it('returns an empty state and a null digest when the order has no status metafield', async () => {
    const f = reply({ data: { order: { metafield: null } } });
    expect(await loadState(ORDER, f as unknown as typeof fetch)).toEqual({ state: emptyState(), digest: null });
  });

  it('returns the stored state with its compareDigest', async () => {
    const f = reply({ data: { order: { metafield: { value: JSON.stringify(saved), compareDigest: 'abc' } } } });
    expect(await loadState(ORDER, f as unknown as typeof fetch)).toEqual({ state: saved, digest: 'abc' });
  });

  it('throws instead of returning an empty state when the stored JSON is malformed', async () => {
    const f = reply({ data: { order: { metafield: { value: '{not json', compareDigest: 'abc' } } } });
    await expect(loadState(ORDER, f as unknown as typeof fetch)).rejects.toThrow(/could not be read/i);
  });

  it('throws when the stored JSON parses but is not a status record', async () => {
    for (const value of ['{}', '[]', 'null', JSON.stringify({ ...saved, history: 'x' }), JSON.stringify({ ...saved, lines: null })]) {
      const f = reply({ data: { order: { metafield: { value, compareDigest: 'abc' } } } });
      await expect(loadState(ORDER, f as unknown as typeof fetch)).rejects.toThrow(/could not be read/i);
    }
  });

  it('throws when Shopify returns GraphQL errors', async () => {
    const f = reply({ errors: [{ message: 'Access denied' }] });
    await expect(loadState(ORDER, f as unknown as typeof fetch)).rejects.toThrow('Access denied');
  });
});

describe('saveState', () => {
  it('sends the digest it was given as compareDigest and returns the new digest', async () => {
    const f = reply({ data: { metafieldsSet: { metafields: [{ compareDigest: 'new' }], userErrors: [] } } });
    const result = await saveState(ORDER, saved, 'old', f as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, digest: 'new' });
    const input = sentBody(f).variables.metafields[0];
    expect(input).toMatchObject({ ownerId: ORDER, key: 'cfs_status', type: 'json', compareDigest: 'old' });
    expect(JSON.parse(input.value)).toEqual(saved);
  });

  it('sends compareDigest null for the first save on an order', async () => {
    const f = reply({ data: { metafieldsSet: { metafields: [{ compareDigest: 'd1' }], userErrors: [] } } });
    await saveState(ORDER, saved, null, f as unknown as typeof fetch);
    expect(sentBody(f).variables.metafields[0].compareDigest).toBeNull();
  });

  it('reports a stale save when Shopify says the metafield changed', async () => {
    const f = reply({ data: { metafieldsSet: { metafields: [], userErrors: [{ code: 'STALE_OBJECT', message: 'modified' }] } } });
    expect(await saveState(ORDER, saved, 'old', f as unknown as typeof fetch)).toMatchObject({ ok: false, reason: 'stale' });
  });

  it('reports any other user error as an error with its message', async () => {
    const f = reply({ data: { metafieldsSet: { metafields: [], userErrors: [{ code: 'TOO_LONG', message: 'Value is too long' }] } } });
    expect(await saveState(ORDER, saved, 'old', f as unknown as typeof fetch)).toEqual({ ok: false, reason: 'error', message: 'Value is too long' });
  });

  it('refuses a value over the 128KB JSON metafield limit and does not call Shopify', async () => {
    const big = { ...saved, history: Array.from({ length: 1000 }, (_, i) => ({ ...saved.history[0], id: `e${i}` })) };
    const f = reply({});
    const result = await saveState(ORDER, big, 'old', f as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, reason: 'error' });
    expect((result as { message: string }).message).toMatch(/128KB/);
    expect(f).not.toHaveBeenCalled();
  });

  it('reports a thrown fetch as an error without throwing', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    expect(await saveState(ORDER, saved, 'old', f as unknown as typeof fetch)).toEqual({ ok: false, reason: 'error', message: 'offline' });
  });
});

describe('totalEntries (history archive counter)', () => {
  it('loads a stored state that has totalEntries', async () => {
    const withTotal = { ...saved, totalEntries: 57 };
    const f = reply({ data: { order: { metafield: { value: JSON.stringify(withTotal), compareDigest: 'abc' } } } });
    expect(await loadState(ORDER, f as unknown as typeof fetch)).toEqual({ state: withTotal, digest: 'abc' });
  });

  it('still loads a stored state without totalEntries (every MVP order)', async () => {
    const f = reply({ data: { order: { metafield: { value: JSON.stringify(saved), compareDigest: 'abc' } } } });
    const { state } = await loadState(ORDER, f as unknown as typeof fetch);
    expect(state.totalEntries).toBeUndefined();
  });

  it('writes totalEntries through to the metafield unchanged', async () => {
    const f = reply({ data: { metafieldsSet: { metafields: [{ compareDigest: 'n' }], userErrors: [] } } });
    await saveState(ORDER, { ...saved, totalEntries: 57 }, 'old', f as unknown as typeof fetch);
    expect(JSON.parse(sentBody(f).variables.metafields[0].value).totalEntries).toBe(57);
  });
});
