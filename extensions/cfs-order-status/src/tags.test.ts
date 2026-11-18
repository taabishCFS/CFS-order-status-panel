import { describe, expect, it, vi } from 'vitest';
import { staleStatusTags, statusTag, syncStatusTag } from './tags';

const ORDER = 'gid://shopify/Order/1034';

describe('statusTag', () => {
  it('builds a readable, filterable tag from the label', () => {
    expect(statusTag('Delivery Booked')).toBe('CFS status: Delivery Booked');
    expect(statusTag('Collection/Display Stock')).toBe('CFS status: Collection/Display Stock');
  });
});

describe('staleStatusTags', () => {
  it('returns earlier CFS status tags other than the new one and ignores unrelated tags', () => {
    const tags = ['cfs-checkout', 'cfs-attempt-abc', 'CFS status: Due In Stock', 'vip'];
    expect(staleStatusTags(tags, 'CFS status: Delivery Booked')).toEqual(['CFS status: Due In Stock']);
  });
  it('keeps the new tag when it is already there', () => {
    expect(staleStatusTags(['CFS status: Delivery Booked'], 'CFS status: Delivery Booked')).toEqual([]);
  });
  it('matches the prefix case-insensitively so hand-typed variants are cleaned up', () => {
    expect(staleStatusTags(['cfs STATUS: Old'], 'CFS status: New')).toEqual(['cfs STATUS: Old']);
  });
});

function shopify(tags: string[], userErrors: unknown[] = []) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const { query } = JSON.parse(init.body);
    if (query.includes('tagsAdd')) return { json: async () => ({ data: { tagsAdd: { userErrors } } }) } as Response;
    if (query.includes('tagsRemove')) return { json: async () => ({ data: { tagsRemove: { userErrors: [] } } }) } as Response;
    return { json: async () => ({ data: { order: { tags } } }) } as Response;
  });
}
const calls = (f: ReturnType<typeof shopify>, name: string) =>
  f.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body)).filter((b) => b.query.includes(name));

describe('syncStatusTag', () => {
  it('adds the new tag first, then removes the old status tag', async () => {
    const f = shopify(['cfs-checkout', 'CFS status: Due In Stock']);
    const r = await syncStatusTag(ORDER, 'Delivery Booked', f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true });
    expect(calls(f, 'tagsAdd')[0].variables).toEqual({ id: ORDER, tags: ['CFS status: Delivery Booked'] });
    expect(calls(f, 'tagsRemove')[0].variables).toEqual({ id: ORDER, tags: ['CFS status: Due In Stock'] });
    const order = f.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body).query as string);
    expect(order.findIndex((q) => q.includes('tagsAdd'))).toBeLessThan(order.findIndex((q) => q.includes('tagsRemove')));
  });
  it('does not call remove when there is nothing stale', async () => {
    const f = shopify(['cfs-checkout']);
    await syncStatusTag(ORDER, 'Delivery Booked', f as unknown as typeof fetch);
    expect(calls(f, 'tagsRemove')).toHaveLength(0);
  });
  it('reports a Shopify user error instead of throwing, and does not remove the old tag', async () => {
    const f = shopify(['CFS status: Old'], [{ message: 'Tag is invalid' }]);
    const r = await syncStatusTag(ORDER, 'Delivery Booked', f as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, message: 'Tag is invalid' });
    expect(calls(f, 'tagsRemove')).toHaveLength(0);
  });
  it('reports a thrown fetch as a failure', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    expect(await syncStatusTag(ORDER, 'X', f as unknown as typeof fetch)).toEqual({ ok: false, message: 'offline' });
  });
});
