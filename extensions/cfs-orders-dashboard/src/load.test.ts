import { describe, expect, it, vi } from 'vitest';
import { loadOrdersPage } from './load';

const reply = (data: unknown, errors?: { message: string }[]) =>
  vi.fn(async () => ({ json: async () => ({ data, errors }) })) as unknown as typeof fetch;

describe('loadOrdersPage', () => {
  it('returns the order nodes and the cursor for the next page', async () => {
    const f = reply({ orders: { nodes: [{ id: 'o1' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } } });
    const page = await loadOrdersPage(null, f);
    expect(page).toEqual({ orders: [{ id: 'o1' }], nextCursor: 'c1' });
  });

  it('has no next cursor on the last page', async () => {
    const f = reply({ orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: 'x' } } });
    expect((await loadOrdersPage('c1', f)).nextCursor).toBeNull();
  });

  it('sends the cursor as the after variable', async () => {
    const f = reply({ orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
    await loadOrdersPage('c9', f);
    const body = JSON.parse((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.variables.after).toBe('c9');
  });

  it('throws the GraphQL error text so the page can show it', async () => {
    await expect(loadOrdersPage(null, reply(null, [{ message: 'Access denied' }]))).rejects.toThrow('Access denied');
  });
});
