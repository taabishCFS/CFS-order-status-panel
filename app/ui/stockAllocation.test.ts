import { describe, expect, it } from 'vitest';
import { allocateStock, countGiven, givenToLine, loadOrderStock, mostToGive, removeAllocation, wholeQty, type GivenStock, type StockOption } from './stockAllocation';
import { deleteFreeStock } from './freeStock';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const option: StockOption = { id: 'f1', brand: 'Actona', productName: 'Bed', productCode: 'A1', warehouseCode: 'FSS1', qty: 3, cost: '125.50' };
const given = (over: Partial<GivenStock> = {}): GivenStock => ({ id: 'a1', lineId: 'L1', qty: 1, unitCost: '125.50', addedByName: 'Sam', createdAt: '2026-11-20T10:00:00Z', brand: 'Actona', productName: 'Bed', productCode: 'A1', warehouseCode: 'FSS1', ...over });

describe('wholeQty', () => {
  it('reads whole numbers from 1 and nothing else', () => {
    expect(wholeQty(' 2 ')).toBe(2);
    for (const bad of ['0', '-1', '1.5', 'x', '', '1234567']) expect(wholeQty(bad)).toBeNull();
  });
});

describe('mostToGive', () => {
  it('is the smaller of what is in stock and what the line still needs, never below 0', () => {
    expect(mostToGive(option, 2, 0)).toBe(2);
    expect(mostToGive(option, 5, 0)).toBe(3);
    expect(mostToGive(option, 2, 2)).toBe(0);
    expect(mostToGive(option, 2, 4)).toBe(0);
  });
});

describe('givenToLine and countGiven', () => {
  it('picks one line and adds its quantities', () => {
    const all = [given(), given({ id: 'a2', qty: 2 }), given({ id: 'a3', lineId: 'L2', qty: 5 })];
    expect(givenToLine(all, 'L1').map((g) => g.id)).toEqual(['a1', 'a2']);
    expect(countGiven(all, 'L1')).toBe(3);
    expect(countGiven(all, 'L9')).toBe(0);
  });
});

describe('loadOrderStock', () => {
  it('returns the allocations and the options', async () => {
    const data = { allocations: [given()], options: { L1: [option] } };
    expect(await loadOrderStock('1038', reply(200, data) as typeof fetch)).toEqual({ ok: true, data });
  });
  it('turns a failure into a message', async () => {
    expect(await loadOrderStock('1038', reply(500, {}) as typeof fetch)).toEqual({ ok: false, message: 'The server answered with status 500.' });
  });
});

describe('allocateStock and removeAllocation', () => {
  it('post the right actions', async () => {
    const bodies: unknown[] = [];
    const record = async (_u: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return reply(200, { ok: true })(); };
    expect(await allocateStock('1038', 'L1', 'f1', 2, record as typeof fetch)).toEqual({ ok: true });
    expect(await removeAllocation('1038', 'a1', record as typeof fetch)).toEqual({ ok: true });
    expect(bodies).toEqual([{ action: 'allocate', lineId: 'L1', freeStockId: 'f1', qty: 2 }, { action: 'remove', allocationId: 'a1' }]);
  });
  it('say in plain words why a request was refused', async () => {
    expect(await allocateStock('1038', 'L1', 'f1', 9, reply(409, { error: 'not_enough' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('not enough') });
    expect(await allocateStock('1038', 'L1', 'f1', 9, reply(409, { error: 'too_many_for_line' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('more than this item ordered') });
    expect(await allocateStock('1038', 'L1', 'f1', 1, reply(409, { error: 'no_match' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('different product') });
    expect(await removeAllocation('1038', 'a1', reply(403, { error: 'staff_not_verified' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('verified staff') });
  });
});

describe('deleting stock that was given out', () => {
  it('explains that it must be taken back from the order first', async () => {
    expect(await deleteFreeStock('f1', reply(409, { error: 'allocated' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('Take it back from the order first') });
  });
});
