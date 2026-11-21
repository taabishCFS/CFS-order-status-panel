import { describe, expect, it } from 'vitest';
import { applyChange, emptyState, reconcileLines } from './state';
import type { Actor } from './identity';
import type { CfsStatus } from './statuses';

const actor: Actor = { id: null, name: 'Sam', source: 'self-declared' };
const ALLOCATED: CfsStatus = { id: 43, label: 'Allocated From Stock' };
const DUE_IN: CfsStatus = { id: 57, label: 'Due In Stock' };
const PART_BOOKED: CfsStatus = { id: 19, label: 'Part Delivery Booked' };
const PART_DELIVERED: CfsStatus = { id: 16, label: 'Part Order Delivered' };
const BED_A = 'gid://shopify/LineItem/1';
const BED_B = 'gid://shopify/LineItem/2';
const DIVAN = 'gid://shopify/LineItem/3';

let n = 0;
const save = (
  state: ReturnType<typeof emptyState>,
  scope: 'order' | 'lines',
  status: CfsStatus,
  lineIds: string[] = [],
) =>
  applyChange(state, {
    scope,
    lineIds,
    status,
    actor,
    now: `2026-11-18T10:00:0${n}Z`,
    entryId: `entry-${n++}`,
  });

describe('applyChange', () => {
  it('saves a whole-order status without touching lines and appends one history entry', () => {
    const s0 = save(emptyState(), 'lines', ALLOCATED, [BED_A]);
    const s1 = save(s0, 'order', PART_BOOKED);
    expect(s1.order).toMatchObject({ statusId: 19, label: 'Part Delivery Booked', by: actor });
    expect(s1.lines).toEqual(s0.lines);
    expect(s1.history).toHaveLength(2);
    expect(s1.history[1]).toMatchObject({
      scope: 'order',
      by: actor,
      changes: [{ target: 'order', fromId: null, toId: 19, toLabel: 'Part Delivery Booked' }],
    });
  });

  it('saves selected lines only and records each line\'s own previous status', () => {
    const s0 = save(emptyState(), 'lines', ALLOCATED, [BED_A]);
    const s1 = save(s0, 'lines', DUE_IN, [BED_A, DIVAN]);
    expect(s1.order).toBeNull();
    expect(s1.lines[BED_A].statusId).toBe(57);
    expect(s1.lines[DIVAN].statusId).toBe(57);
    expect(s1.history[1].changes).toEqual([
      { target: BED_A, fromId: 43, toId: 57, toLabel: 'Due In Stock' },
      { target: DIVAN, fromId: null, toId: 57, toLabel: 'Due In Stock' },
    ]);
  });

  it('keeps scopes independent across the B1, B2, B3 sequence', () => {
    let s = save(emptyState(), 'lines', ALLOCATED, [BED_A, BED_B]);
    s = save(s, 'lines', DUE_IN, [DIVAN]);
    s = save(s, 'order', PART_BOOKED);
    s = save(s, 'lines', PART_DELIVERED, [BED_A]);
    expect(s.order?.statusId).toBe(19);
    expect(s.lines[BED_A].statusId).toBe(16);
    expect(s.lines[BED_B].statusId).toBe(43);
    expect(s.lines[DIVAN].statusId).toBe(57);
    expect(s.history).toHaveLength(4);
  });

  it('holds different statuses for separate lines of the same product', () => {
    const s = save(save(emptyState(), 'lines', ALLOCATED, [BED_A]), 'lines', DUE_IN, [BED_B]);
    expect(s.lines[BED_A].statusId).not.toBe(s.lines[BED_B].statusId);
  });

  it('does not mutate the state it is given', () => {
    const s0 = save(emptyState(), 'lines', ALLOCATED, [BED_A]);
    const frozen = JSON.stringify(s0);
    save(s0, 'lines', DUE_IN, [BED_A]);
    expect(JSON.stringify(s0)).toBe(frozen);
  });

  it('refuses a lines save with nothing selected', () => {
    expect(() => save(emptyState(), 'lines', ALLOCATED, [])).toThrow('Select at least one item');
  });
});

describe('reconcileLines', () => {
  it('reports lines that have a saved status but are no longer on the order, and keeps their stamps', () => {
    const s = save(emptyState(), 'lines', ALLOCATED, [BED_A, BED_B]);
    const { active, removed } = reconcileLines(s, [BED_A, DIVAN]);
    expect(removed).toEqual([BED_B]);
    expect(active).toEqual([BED_A, DIVAN]);
    expect(s.lines[BED_B].statusId).toBe(43);
  });
});

describe('applyChange extras (cancel reason, credit note, service remarks, refund flag)', () => {
  const CANCELLED: CfsStatus = { id: 7, label: 'Cancelled' };
  const CREDIT: CfsStatus = { id: 21, label: 'Credit Note' };
  const SERVICE: CfsStatus = { id: 15, label: 'Service' };
  const IN_STOCK: CfsStatus = { id: 4, label: 'In Stock' };
  const go = (state: ReturnType<typeof emptyState>, scope: 'order' | 'lines', status: CfsStatus, lineIds: string[], extras?: Record<string, string>, allLineIds?: string[]) =>
    applyChange(state, { scope, lineIds, status, actor, now: `2026-11-21T10:00:0${n}Z`, entryId: `x-${n++}`, extras, allLineIds });

  it('keeps the cancel reason on a cancelled line and in the history entry', () => {
    const next = go(emptyState(), 'lines', CANCELLED, [BED_A], { cancelReason: '  Customer changed mind ' }, [BED_A, BED_B]);
    expect(next.lines[BED_A].extras).toEqual({ cancelReason: 'Customer changed mind' });
    expect(next.history[0].note).toBe('Cancel reason: Customer changed mind');
    expect(next.schemaVersion).toBe(2);
  });

  it('keeps the credit note amount as pounds and pence, and refuses an amount that is not money', () => {
    const next = go(emptyState(), 'lines', CREDIT, [BED_A], { creditNoteAmount: '£1,025.5' });
    expect(next.lines[BED_A].extras).toEqual({ creditNoteAmount: '1025.50' });
    expect(next.history[0].note).toBe('Credit note amount: 1025.50');
    for (const bad of ['abc', '-3', '1.234', '12345678']) {
      expect(() => go(emptyState(), 'lines', CREDIT, [BED_A], { creditNoteAmount: bad })).toThrow(/credit note/i);
    }
  });

  it('keeps service remarks, and refuses more than 500 characters', () => {
    const next = go(emptyState(), 'lines', SERVICE, [BED_A], { serviceRemarks: 'Engineer visit Tuesday' });
    expect(next.lines[BED_A].extras).toEqual({ serviceRemarks: 'Engineer visit Tuesday' });
    expect(() => go(emptyState(), 'lines', SERVICE, [BED_A], { serviceRemarks: 'x'.repeat(501) })).toThrow(/500/);
  });

  it('ignores extras that do not belong to the chosen status and stores nothing when blank', () => {
    const next = go(emptyState(), 'lines', IN_STOCK, [BED_A], { cancelReason: 'nope', serviceRemarks: 'nope' });
    expect(next.lines[BED_A].extras).toBeUndefined();
    expect(next.history[0].note).toBeUndefined();
    expect(go(emptyState(), 'lines', CANCELLED, [BED_A], { cancelReason: '  ' }).lines[BED_A].extras).toBeUndefined();
  });

  it('raises a full refund flag when every line is cancelled and a part flag otherwise', () => {
    const part = go(emptyState(), 'lines', CANCELLED, [BED_A], { cancelReason: 'Out of range' }, [BED_A, BED_B]);
    expect(part.refund).toMatchObject({ type: 'part', reason: 'Out of range', by: actor });
    const full = go(part, 'lines', CANCELLED, [BED_B], undefined, [BED_A, BED_B]);
    expect(full.refund).toMatchObject({ type: 'full', reason: 'Out of range' });
    const whole = go(emptyState(), 'order', CANCELLED, [], { cancelReason: 'Fraud check' });
    expect(whole.refund).toMatchObject({ type: 'full', reason: 'Fraud check' });
    expect(go(emptyState(), 'lines', IN_STOCK, [BED_A]).refund).toBeUndefined();
  });
});

describe('applyChange supplier delivery date (status 4)', () => {
  const IN_STOCK: CfsStatus = { id: 4, label: 'In Stock' };
  const at = (now: string, state = emptyState(), status: CfsStatus = IN_STOCK, lineIds = [BED_A]) =>
    applyChange(state, { scope: 'lines', lineIds, status, actor, now, entryId: `s-${n++}` });

  it('stamps the UK date the goods came in on each line set to In Stock', () => {
    const next = at('2026-11-21T10:00:00Z', emptyState(), IN_STOCK, [BED_A, BED_B]);
    expect(next.supplierDelivered).toEqual({
      [BED_A]: { date: '2026-11-21', at: '2026-11-21T10:00:00Z', by: actor },
      [BED_B]: { date: '2026-11-21', at: '2026-11-21T10:00:00Z', by: actor },
    });
    expect(next.schemaVersion).toBe(2);
  });

  it('uses UK time, so a late evening in summer is already the next day', () => {
    expect(at('2026-06-30T23:30:00Z').supplierDelivered?.[BED_A].date).toBe('2026-07-01');
  });

  it('keeps the stamp when the line later moves to another status, and restamps on a second In Stock', () => {
    const first = at('2026-11-20T10:00:00Z');
    const moved = at('2026-11-21T10:00:00Z', first, ALLOCATED);
    expect(moved.supplierDelivered?.[BED_A].date).toBe('2026-11-20');
    expect(at('2026-11-22T10:00:00Z', moved).supplierDelivered?.[BED_A].date).toBe('2026-11-22');
  });

  it('does not stamp other statuses or a whole-order save', () => {
    expect(at('2026-11-21T10:00:00Z', emptyState(), ALLOCATED).supplierDelivered).toBeUndefined();
    const order = applyChange(emptyState(), { scope: 'order', lineIds: [], status: IN_STOCK, actor, now: '2026-11-21T10:00:00Z', entryId: `o-${n++}` });
    expect(order.supplierDelivered).toBeUndefined();
  });
});
