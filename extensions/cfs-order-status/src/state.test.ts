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
