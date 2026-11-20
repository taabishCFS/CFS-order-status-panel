import { describe, expect, it, vi } from 'vitest';
import { archiveOrders, buildQuery, loadBrands, loadLineExport, loadLineList, loadOrderList } from './listApi';

const asFetch = (f: unknown) => f as unknown as typeof fetch;
const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response);

describe('buildQuery', () => {
  it('leaves out blank filters and encodes the search', () => {
    expect(buildQuery({ page: 2, brand: '', from: '2026-11-01', q: 'a b&c', statusId: null, archived: false })).toBe('?page=2&from=2026-11-01&q=a%20b%26c');
  });
  it('writes flags as 1 and is empty with nothing set', () => {
    expect(buildQuery({ all: true, archived: true, insurance: true, statusId: 3 })).toBe('?all=1&statusId=3&archived=1&insurance=1');
    expect(buildQuery({})).toBe('');
  });
});

describe('loaders', () => {
  it('loadOrderList calls the order list route and returns the data', async () => {
    const f = reply(200, { rows: [], total: 0, page: 1, pageCount: 1, capped: false });
    const res = await loadOrderList({ page: 3 }, asFetch(f));
    expect(f).toHaveBeenCalledWith('/api/order-list?page=3', undefined);
    expect(res).toEqual({ ok: true, data: { rows: [], total: 0, page: 1, pageCount: 1, capped: false } });
  });

  it('loadLineList calls the line list route', async () => {
    const f = reply(200, { rows: [], summary: { lines: 0, orders: 0, units: 0 }, capped: false });
    expect((await loadLineList({ brand: 'Actona' }, asFetch(f))).ok).toBe(true);
    expect(f).toHaveBeenCalledWith('/api/line-list?brand=Actona', undefined);
  });

  it('loadBrands returns the brand names', async () => {
    expect(await loadBrands(asFetch(reply(200, { brands: ['A', 'B'] })))).toEqual({ ok: true, brands: ['A', 'B'] });
  });

  it('turns a refusal into a message, never a throw', async () => {
    expect(await loadOrderList({}, asFetch(reply(500, { error: 'boom' })))).toEqual({ ok: false, message: 'boom' });
    expect(await loadOrderList({}, asFetch(reply(502, null)))).toEqual({ ok: false, message: 'The server answered with status 502' });
    const down = vi.fn(async () => { throw new Error('offline'); });
    expect(await loadBrands(asFetch(down))).toEqual({ ok: false, message: 'offline' });
  });
});

describe('archiveOrders', () => {
  it('posts the ids and the flag and returns the count', async () => {
    const f = reply(200, { ok: true, count: 2 });
    expect(await archiveOrders(['gid://shopify/Order/1'], true, asFetch(f))).toEqual({ ok: true, count: 2 });
    expect(f).toHaveBeenCalledWith('/api/orders/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIds: ['gid://shopify/Order/1'], archived: true }) });
  });

  it('explains an unverified staff member in plain words', async () => {
    const res = await archiveOrders(['x'], true, asFetch(reply(403, { error: 'staff_not_verified' })));
    expect(res).toEqual({ ok: false, message: 'Only a verified staff member can archive or restore orders.' });
  });
});

describe('loadLineExport', () => {
  it('asks for the export kind with the list filters, without the page', async () => {
    const body = { csv: 'A\r\n', count: 1, capped: false, costLookup: 'ok', filename: 'x.csv' };
    const f = reply(200, body);
    const res = await loadLineExport(3, { brand: 'Actona', page: 4, all: true, insurance: true }, asFetch(f));
    expect(f).toHaveBeenCalledWith('/api/line-export?kind=3&brand=Actona&insurance=1', undefined);
    expect(res).toEqual({ ok: true, data: body });
  });

  it('explains an unverified staff member in plain words', async () => {
    const res = await loadLineExport(2, {}, asFetch(reply(403, { error: 'staff_not_verified' })));
    expect(res).toEqual({ ok: false, message: 'Only a verified staff member can download exports.' });
  });
});
