import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../cfs-order-status/src/identity';
import { emptyState } from '../../cfs-order-status/src/state';
import type { StatusState } from '../../cfs-order-status/src/types';
import { bulkChangeStatus, bulkExpectedDate, groupByOrder } from './bulk';
import type { LineRow } from './listApi';

const actor: Actor = { id: '9', name: 'Sam Patel', source: 'staff-member' };
const status = { id: 3, label: 'Order in Progress' };
const row = (orderId: string, lineId: string): LineRow => ({ lineId, orderId, orderName: `#${orderId.split('/').pop()}`, orderCreatedAt: '2026-11-20T00:00:00Z', site: 'CFS', brand: 'A', product: 'P', variantTitle: null, sku: null, quantity: 1, priceMinor: 1, currency: 'GBP', lineStatusId: null, expectedDate: null, deliveryOutcome: null, supplierInvoicePaid: false });
const O1 = 'gid://shopify/Order/1';
const O2 = 'gid://shopify/Order/2';
const groups = new Map([[O1, ['L1', 'L2']], [O2, ['L3']]]);

// A fake save that runs the build step so the test can see the record it would write.
function fakes(saveResult: (orderId: string) => unknown = () => ({ ok: true, digest: 'd' })) {
  const written: Record<string, StatusState> = {};
  const ids: string[] = [];
  return {
    written,
    ids,
    deps: {
      load: vi.fn(async () => ({ state: emptyState(), digest: 'd0' })),
      save: vi.fn(async (orderId: string, loaded: { state: StatusState }, build: (s: StatusState) => StatusState) => {
        const next = build(loaded.state);
        written[orderId] = next;
        ids.push(next.history[next.history.length - 1].id);
        return saveResult(orderId);
      }),
      sync: vi.fn(async () => undefined),
      newId: (() => { let n = 0; return () => `e${(n += 1)}`; })(),
      now: () => '2026-11-21T10:00:00.000Z',
    },
  };
}

describe('groupByOrder', () => {
  it('groups the ticked lines by order and ignores unticked ones', () => {
    const rows = [row(O1, 'L1'), row(O1, 'L2'), row(O2, 'L3'), row(O2, 'L4')];
    const result = groupByOrder(rows, new Set(['L1', 'L2', 'L3']));
    expect([...result.entries()]).toEqual([[O1, ['L1', 'L2']], [O2, ['L3']]]);
  });
});

describe('bulkChangeStatus', () => {
  it('saves each order with its own entry id and syncs each saved order once', async () => {
    const f = fakes();
    const res = await bulkChangeStatus({ groups, status, actor, deps: f.deps });
    expect(res).toEqual({ saved: [O1, O2], failed: [] });
    expect(f.written[O1].lines.L1.statusId).toBe(3);
    expect(f.written[O1].lines.L2.statusId).toBe(3);
    expect(Object.keys(f.written[O2].lines)).toEqual(['L3']);
    expect(new Set(f.ids).size).toBe(2);
    expect(f.deps.sync).toHaveBeenCalledTimes(2);
  });

  it('refuses status 1 for every order without saving (legacy rule)', async () => {
    const f = fakes();
    const res = await bulkChangeStatus({ groups, status: { id: 1, label: 'Payment Process' }, actor, deps: f.deps });
    expect(res.saved).toEqual([]);
    expect(res.failed.map((x) => x.orderId)).toEqual([O1, O2]);
    expect(f.deps.save).not.toHaveBeenCalled();
  });

  it('names a stale order and still saves the next one', async () => {
    const f = fakes((orderId) => (orderId === O1 ? { ok: false, reason: 'stale', message: 'stale' } : { ok: true, digest: 'd' }));
    const res = await bulkChangeStatus({ groups, status, actor, deps: f.deps });
    expect(res.saved).toEqual([O2]);
    expect(res.failed).toEqual([{ orderId: O1, message: 'Someone else changed this order. Open it and try again.' }]);
    expect(f.deps.sync).toHaveBeenCalledTimes(1);
  });

  it('keeps going when loading or saving throws', async () => {
    const f = fakes();
    f.deps.load.mockRejectedValueOnce(new Error('Shopify down'));
    const res = await bulkChangeStatus({ groups, status, actor, deps: f.deps });
    expect(res.failed).toEqual([{ orderId: O1, message: 'Shopify down' }]);
    expect(res.saved).toEqual([O2]);
  });

  it('saves one order at a time, never in parallel', async () => {
    const f = fakes();
    let running = 0;
    let peak = 0;
    f.deps.save.mockImplementation(async (_o: string, loaded: { state: StatusState }, build: (s: StatusState) => StatusState) => {
      running += 1; peak = Math.max(peak, running);
      build(loaded.state);
      await Promise.resolve();
      running -= 1;
      return { ok: true, digest: 'd' };
    });
    await bulkChangeStatus({ groups, status, actor, deps: f.deps });
    expect(peak).toBe(1);
  });
});

describe('bulkExpectedDate', () => {
  it('sets the date on the ticked lines of each order', async () => {
    const f = fakes();
    const res = await bulkExpectedDate({ groups, date: '2026-12-10', actor, deps: f.deps });
    expect(res.saved).toEqual([O1, O2]);
    expect(f.written[O1].expected?.L1.date).toBe('2026-12-10');
    expect(f.written[O1].expected?.L2.date).toBe('2026-12-10');
  });

  it('clears the date when given null', async () => {
    const f = fakes();
    await bulkExpectedDate({ groups, date: null, actor, deps: f.deps });
    expect(f.written[O2].expected?.L3.date).toBeNull();
  });

  it('reports an invalid date as a failure for the order, not a crash', async () => {
    const f = fakes();
    f.deps.save.mockImplementation(async (_o: string, loaded: { state: StatusState }, build: (s: StatusState) => StatusState) => {
      try { build(loaded.state); } catch (e) { return { ok: false, reason: 'error', message: (e as Error).message }; }
      return { ok: true, digest: 'd' };
    });
    const res = await bulkExpectedDate({ groups, date: 'not a date', actor, deps: f.deps });
    expect(res.saved).toEqual([]);
    expect(res.failed[0]).toEqual({ orderId: O1, message: 'Enter a valid date' });
  });
});
