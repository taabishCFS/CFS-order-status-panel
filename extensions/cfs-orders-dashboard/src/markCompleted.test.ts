import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../cfs-order-status/src/identity';
import { emptyState } from '../../cfs-order-status/src/state';
import type { StatusState } from '../../cfs-order-status/src/types';
import { groupLines, markCompleted, markCompletedText } from './markCompleted';

const actor: Actor = { id: '9', name: 'Sam Patel', source: 'staff-member' };
const O1 = 'gid://shopify/Order/1';
const O2 = 'gid://shopify/Order/2';
const groups = new Map([[O1, ['L1', 'L2']], [O2, ['L3']]]);

function fakes(opts: { saveFails?: string; emailOk?: boolean } = {}) {
  const written: Record<string, StatusState> = {};
  return {
    written,
    deps: {
      load: vi.fn(async () => ({ state: emptyState(), digest: 'd0' })),
      save: vi.fn(async (orderId: string, loaded: { state: StatusState }, build: (s: StatusState) => StatusState) => {
        if (orderId === opts.saveFails) return { ok: false as const, reason: 'stale' as const, message: 'x' };
        written[orderId] = build(loaded.state);
        return { ok: true as const, digest: 'd' };
      }),
      sync: vi.fn(async () => undefined),
      email: vi.fn(async () => (opts.emailOk === false ? { ok: false, message: 'Customer email is turned off on the backend.' } : { ok: true, recipients: ['a@b.c'] })),
      now: () => '2026-11-21T10:00:00.000Z',
      newId: (() => { let n = 0; return () => `e${(n += 1)}`; })(),
    },
  };
}

describe('groupLines', () => {
  it('groups ticked lines by order', () => {
    const rows = [{ orderId: O1, lineId: 'L1' }, { orderId: O1, lineId: 'L2' }, { orderId: O2, lineId: 'L3' }];
    expect([...groupLines(rows, new Set(['L1', 'L3']))]).toEqual([[O1, ['L1']], [O2, ['L3']]]);
  });
});

describe('markCompleted', () => {
  it('sets Completed on the ticked lines of each order and does not email by default', async () => {
    const f = fakes();
    const r = await markCompleted({ groups, actor, email: false, deps: f.deps });
    expect(r).toMatchObject({ saved: [O1, O2], failed: [], emailed: 0 });
    expect(f.written[O1].lines.L1.statusId).toBe(6);
    expect(f.written[O1].lines.L2.statusId).toBe(6);
    expect(f.written[O2].lines.L3.statusId).toBe(6);
    expect(f.deps.sync).toHaveBeenCalledTimes(2);
    expect(f.deps.email).not.toHaveBeenCalled();
  });
  it('emails each order once when asked, with a status email request for Completed', async () => {
    const f = fakes();
    const r = await markCompleted({ groups, actor, email: true, deps: f.deps });
    expect(r.emailed).toBe(2);
    expect(f.deps.email).toHaveBeenCalledTimes(2);
    expect(f.deps.email.mock.calls[0][0]).toMatchObject({ orderId: '1', statusId: 6, lineIds: ['L1', 'L2'] });
    expect(markCompletedText(r, true)).toBe('Marked Completed: 2 orders. 2 customer emails queued.');
  });
  it('a failed save is reported and the others still go ahead', async () => {
    const f = fakes({ saveFails: O1 });
    const r = await markCompleted({ groups, actor, email: true, deps: f.deps });
    expect(r.saved).toEqual([O2]);
    expect(r.failed).toEqual([{ orderId: O1, message: 'Someone else changed this order. Open it and try again.' }]);
    expect(f.deps.email).toHaveBeenCalledTimes(1);
  });
  it('an email that cannot be queued does not undo the status', async () => {
    const f = fakes({ emailOk: false });
    const r = await markCompleted({ groups, actor, email: true, deps: f.deps });
    expect(r.saved).toHaveLength(2);
    expect(markCompletedText(r, true)).toBe('Marked Completed: 2 orders. 0 customer emails queued. Not emailed: Customer email is turned off on the backend.');
  });
  it('says the customers were not emailed when the tick is off', () => {
    expect(markCompletedText({ saved: [O1], failed: [], emailed: 0, emailProblems: [] }, false)).toBe('Marked Completed: 1 order. The customers were not emailed.');
  });
});
