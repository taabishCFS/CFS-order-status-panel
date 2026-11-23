import { describe, expect, it } from 'vitest';
import {
  INSTRUCTIONS_MAX,
  NOTE_MAX,
  applyCondition,
  applyConfigurationChange,
  applyContactChange,
  applyDelivery,
  applyExpectedDate,
  applyInstructions,
  applyNote,
  applyRefundRequest,
  applyProductChange,
  applyServicesChange,
  applyTracking,
  headerProposal,
} from './detailState';
import type { Actor } from './identity';
import { applyChange, emptyState } from './state';
import type { CfsStatus } from './statuses';
import type { StatusState } from './types';

const actor: Actor = { id: null, name: 'Sam', source: 'self-declared' };
const A = 'gid://shopify/LineItem/1';
const B = 'gid://shopify/LineItem/2';
const C = 'gid://shopify/LineItem/3';
let n = 0;
const base = (lineIds: string[]) => ({ lineIds, actor, now: `2026-11-19T10:00:0${n}Z`, entryId: `e-${n++}` });
const txt = (text: string) => ({ text, actor, now: '2026-11-19T10:00:00Z', entryId: `t-${n++}` });
const stamp = (statusId: number) => ({ statusId, label: `S${statusId}`, at: 'x', by: actor });
const withStatuses = (lines: Record<string, number>, order: number | null = null): StatusState => ({
  ...emptyState(),
  order: order === null ? null : stamp(order),
  lines: Object.fromEntries(Object.entries(lines).map(([id, s]) => [id, stamp(s)])),
});

describe('applyExpectedDate', () => {
  it('sets the date on the chosen lines only and records one entry listing both', () => {
    const s = applyExpectedDate(emptyState(), { ...base([A, B]), date: '2026-12-01' });
    expect(s.expected?.[A]).toMatchObject({ date: '2026-12-01', by: actor });
    expect(s.expected?.[B]?.date).toBe('2026-12-01');
    expect(s.expected?.[C]).toBeUndefined();
    expect(s.schemaVersion).toBe(2);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ scope: 'expected-date', changes: [] });
    expect(s.history[0].values).toEqual([
      { target: A, from: null, to: '2026-12-01' },
      { target: B, from: null, to: '2026-12-01' },
    ]);
  });

  it('records the previous date, and null clears', () => {
    const s0 = applyExpectedDate(emptyState(), { ...base([A]), date: '2026-12-01' });
    const s1 = applyExpectedDate(s0, { ...base([A]), date: '2026-12-08' });
    expect(s1.history[1].values).toEqual([{ target: A, from: '2026-12-01', to: '2026-12-08' }]);
    const s2 = applyExpectedDate(s1, { ...base([A]), date: null });
    expect(s2.expected?.[A]?.date).toBeNull();
    expect(s2.history[2].values).toEqual([{ target: A, from: '2026-12-08', to: null }]);
  });

  it('refuses no lines and invalid dates', () => {
    expect(() => applyExpectedDate(emptyState(), { ...base([]), date: '2026-12-01' })).toThrow('Select at least one item');
    for (const bad of ['', '2026-13-45', '01/12/2026', '2026-02-30']) {
      expect(() => applyExpectedDate(emptyState(), { ...base([A]), date: bad })).toThrow('Enter a valid date');
    }
  });

  it('does not change the input state and keeps existing data', () => {
    const s0 = applyChange(emptyState(), {
      scope: 'order',
      lineIds: [],
      status: { id: 3, label: 'In Progress' },
      actor,
      now: 'x',
      entryId: 'o1',
    });
    const copy = JSON.parse(JSON.stringify(s0));
    const s1 = applyExpectedDate(s0, { ...base([A]), date: '2026-12-01' });
    expect(s0).toEqual(copy);
    expect(s1.order).toEqual(s0.order);
    expect(s1.history[0]).toEqual(s0.history[0]);
  });
});

describe('applyDelivery', () => {
  it('records the outcome per line and the previous outcome in history', () => {
    const s0 = applyDelivery(emptyState(), { ...base([A, B]), outcome: 'confirmed' });
    expect(s0.delivery?.[A]).toMatchObject({ outcome: 'confirmed', by: actor });
    const s1 = applyDelivery(s0, { ...base([A]), outcome: 'declined' });
    expect(s1.delivery?.[A]?.outcome).toBe('declined');
    expect(s1.delivery?.[B]?.outcome).toBe('confirmed');
    expect(s1.history[0]).toMatchObject({ scope: 'delivery', changes: [] });
    expect(s1.history[0].values).toEqual([
      { target: A, from: null, to: 'confirmed' },
      { target: B, from: null, to: 'confirmed' },
    ]);
    expect(s1.history[1].values).toEqual([{ target: A, from: 'confirmed', to: 'declined' }]);
    expect(s1.schemaVersion).toBe(2);
  });

  it('refuses no lines', () => {
    expect(() => applyDelivery(emptyState(), { ...base([]), outcome: 'confirmed' })).toThrow('Select at least one item');
  });
});

describe('applyNote', () => {
  it('trims and stores the note as one history entry', () => {
    const s = applyNote(emptyState(), txt('  Called customer  '));
    expect(s.history[0]).toMatchObject({ scope: 'note', note: 'Called customer', changes: [], by: actor });
    expect(s.schemaVersion).toBe(2);
  });

  it('refuses blank and over-long notes, but allows exactly the limit', () => {
    expect(() => applyNote(emptyState(), txt('   '))).toThrow('Enter a note');
    expect(() => applyNote(emptyState(), txt('x'.repeat(NOTE_MAX + 1)))).toThrow('Notes are limited to 2000 characters');
    expect(applyNote(emptyState(), txt('x'.repeat(NOTE_MAX))).history).toHaveLength(1);
  });
});

describe('applyInstructions', () => {
  it('sets, edits and clears the instructions with old and new text in history', () => {
    const s0 = applyInstructions(emptyState(), txt('Call before delivery'));
    expect(s0.instructions).toMatchObject({ text: 'Call before delivery', by: actor });
    const s1 = applyInstructions(s0, txt('Leave with neighbour'));
    expect(s1.history[1].values).toEqual([{ target: 'order', from: 'Call before delivery', to: 'Leave with neighbour' }]);
    const s2 = applyInstructions(s1, txt(''));
    expect(s2.instructions).toBeNull();
    expect(s2.history[2]).toMatchObject({ scope: 'instructions' });
    expect(s2.history[2].values).toEqual([{ target: 'order', from: 'Leave with neighbour', to: null }]);
  });

  it('refuses text over the limit', () => {
    expect(() => applyInstructions(emptyState(), txt('x'.repeat(INSTRUCTIONS_MAX + 1)))).toThrow(
      'Instructions are limited to 1000 characters',
    );
    expect(applyInstructions(emptyState(), txt('x'.repeat(INSTRUCTIONS_MAX))).instructions?.text).toHaveLength(INSTRUCTIONS_MAX);
  });
});

describe('headerProposal', () => {
  it('proposes the shared status when every current line has it and the order differs', () => {
    expect(headerProposal(withStatuses({ [A]: 3, [B]: 3 }, 4), [A, B])).toBe(3);
    expect(headerProposal(withStatuses({ [A]: 3, [B]: 3 }), [A, B])).toBe(3);
  });
  it('proposes nothing for mixed, unset, already-matching or empty cases', () => {
    expect(headerProposal(withStatuses({ [A]: 3, [B]: 4 }), [A, B])).toBeNull();
    expect(headerProposal(withStatuses({ [A]: 3 }), [A, B])).toBeNull();
    expect(headerProposal(withStatuses({ [A]: 3, [B]: 3 }, 3), [A, B])).toBeNull();
    expect(headerProposal(withStatuses({ [A]: 3 }), [])).toBeNull();
  });
  it('ignores a removed line with a different status', () => {
    expect(headerProposal(withStatuses({ [A]: 3, [B]: 3, [C]: 7 }), [A, B])).toBe(3);
  });
});

describe('applyChange status 4 clears the expected date', () => {
  const IN_STOCK: CfsStatus = { id: 4, label: 'In Stock' };
  const OTHER: CfsStatus = { id: 43, label: 'Allocated From Stock' };
  const withDate = (lineIds: string[]): StatusState => ({
    ...emptyState(),
    expected: Object.fromEntries(lineIds.map((id) => [id, { date: '2026-12-01', at: 'x', by: actor }])),
  });
  const save = (state: StatusState, status: CfsStatus, lineIds: string[]) =>
    applyChange(state, { scope: 'lines', lineIds, status, actor, now: 'x', entryId: `s-${n++}` });

  it('clears the date on ticked lines in the same history entry', () => {
    const s = save(withDate([A, B]), IN_STOCK, [A]);
    expect(s.expected?.[A]?.date).toBeNull();
    expect(s.expected?.[B]?.date).toBe('2026-12-01');
    expect(s.history[0].values).toEqual([{ target: A, from: '2026-12-01', to: null }]);
  });
  it('adds no clear when the line has no date, and other statuses leave dates alone', () => {
    expect(save(emptyState(), IN_STOCK, [A]).history[0].values).toBeUndefined();
    const s = save(withDate([A]), OTHER, [A]);
    expect(s.expected?.[A]?.date).toBe('2026-12-01');
    expect(s.history[0].values).toBeUndefined();
  });
});

describe('applyServicesChange', () => {
  it('adds one history entry listing each service with its old and new amount, and changes no status', () => {
    const before = withStatuses({ [A]: 4 });
    const next = applyServicesChange(before, { ...txt('x'), changes: [{ label: 'Two Man Delivery', from: null, to: '£60.00' }, { label: 'Scotland Delivery', from: '£25.00', to: null }] });
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ scope: 'services', changes: [], values: [{ target: 'Two Man Delivery', from: null, to: '£60.00' }, { target: 'Scotland Delivery', from: '£25.00', to: null }] });
    expect(next.lines).toEqual(before.lines);
    expect(next.schemaVersion).toBe(2);
  });
  it('refuses an empty list', () => {
    expect(() => applyServicesChange(withStatuses({}), { ...txt('x'), changes: [] })).toThrow(/nothing/i);
  });
});

describe('applyCondition', () => {
  it('stores the condition on the order with who and when, and records old and new in the history', () => {
    const first = applyCondition(withStatuses({}), { ...txt('x'), value: 'WaitForEntireOrder' });
    expect(first.condition).toEqual({ value: 'WaitForEntireOrder', at: '2026-11-19T10:00:00Z', by: actor });
    expect(first.history[0]).toMatchObject({ scope: 'condition', changes: [], values: [{ target: 'order', from: null, to: 'WAIT FOR ENTIRE ORDER' }] });
    const second = applyCondition(first, { ...txt('y'), value: 'OKForPartDelivery' });
    expect(second.history[1].values).toEqual([{ target: 'order', from: 'WAIT FOR ENTIRE ORDER', to: 'OK FOR PART DELIVERY' }]);
    expect(second.schemaVersion).toBe(2);
  });
  it('refuses a condition that is not on the list', () => {
    expect(() => applyCondition(withStatuses({}), { ...txt('x'), value: 'Whatever' })).toThrow(/condition/i);
  });
});

describe('applyRefundRequest', () => {
  it('adds one history entry saying what was requested and why, and changes no status', () => {
    const before = withStatuses({ [A]: 4 });
    const next = applyRefundRequest(before, { ...txt('x'), summary: 'Part refund £25.00: Damaged Part Refund', notes: 'Leg snapped' });
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ scope: 'refund', changes: [], values: [{ target: 'order', from: null, to: 'Part refund £25.00: Damaged Part Refund' }], note: 'Leg snapped' });
    expect(next.lines).toEqual(before.lines);
    expect(next.schemaVersion).toBe(2);
  });
  it('leaves the note out when there are no notes', () => {
    expect(applyRefundRequest(withStatuses({}), { ...txt('x'), summary: 'Full refund £10.00: Discontinued', notes: '' }).history[0].note).toBeUndefined();
  });
});

describe('applyTracking', () => {
  it('stores the tracking number with who and when, and adds a history entry with the old and new number', () => {
    const first = applyTracking(withStatuses({}), { ...txt('x'), number: '  GE123 456 789  ' });
    expect(first.tracking).toEqual({ number: 'GE123 456 789', at: '2026-11-19T10:00:00Z', by: actor });
    expect(first.history[0]).toMatchObject({ scope: 'tracking', changes: [], values: [{ target: 'order', from: null, to: 'GE123 456 789' }] });
    const second = applyTracking(first, { ...txt('y'), number: 'GE999' });
    expect(second.history[1].values).toEqual([{ target: 'order', from: 'GE123 456 789', to: 'GE999' }]);
    expect(second.schemaVersion).toBe(2);
  });

  it('refuses an empty, too short, too long or odd-looking number', () => {
    for (const bad of ['', '  ', 'ab', 'x'.repeat(41), 'GE123<script>']) {
      expect(() => applyTracking(withStatuses({}), { ...txt('x'), number: bad })).toThrow(/tracking/i);
    }
  });
});

describe('applyContactChange', () => {
  it('adds one history entry listing each changed detail with its old and new value, and changes no status', () => {
    const before = withStatuses({ [A]: 4 });
    const next = applyContactChange(before, { ...txt('x'), changes: [{ label: 'Email', from: 'a@old.com', to: 'a@new.com' }, { label: 'Shipping address', from: '1 High St, Leeds', to: '2 Low Rd, York' }] });
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ scope: 'contact', changes: [], values: [{ target: 'Email', from: 'a@old.com', to: 'a@new.com' }, { target: 'Shipping address', from: '1 High St, Leeds', to: '2 Low Rd, York' }] });
    expect(next.lines).toEqual(before.lines);
    expect(next.schemaVersion).toBe(2);
    expect(before.history).toHaveLength(0);
  });

  it('refuses an empty list of changes', () => {
    expect(() => applyContactChange(withStatuses({}), { ...txt('x'), changes: [] })).toThrow(/nothing/i);
  });
});

describe('applyConfigurationChange', () => {
  it('adds one history entry for the line with the old and new options and the note, and changes nothing else', () => {
    const before = withStatuses({ [A]: 4 });
    const next = applyConfigurationChange(before, { ...txt('x'), lineId: A, from: 'Fabric: Caramel', to: 'Fabric: Black', note: 'Price difference +£140.00. Reason: Asked' });
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ scope: 'configuration', changes: [], values: [{ target: A, from: 'Fabric: Caramel', to: 'Fabric: Black' }], note: 'Price difference +£140.00. Reason: Asked' });
    expect(next.lines).toEqual(before.lines);
    expect(next.schemaVersion).toBe(2);
    expect(before.history).toHaveLength(0);
  });
});

describe('applyProductChange', () => {
  it('adds one history entry naming the product added, and the line it replaced when there was one', () => {
    const before = withStatuses({ [A]: 4 });
    const swapped = applyProductChange(before, { ...txt('x'), from: 'Oslo Sideboard (Oak) x 1 = £119.99', to: 'Bergen Table x 2 = £240.00' });
    expect(swapped.history).toHaveLength(1);
    expect(swapped.history[0]).toMatchObject({ scope: 'product', changes: [], values: [{ target: 'Product', from: 'Oslo Sideboard (Oak) x 1 = £119.99', to: 'Bergen Table x 2 = £240.00' }] });
    expect(swapped.lines).toEqual(before.lines);
    expect(applyProductChange(before, { ...txt('y'), from: null, to: 'Bergen Table x 2 = £240.00' }).history[0].values).toEqual([{ target: 'Product', from: null, to: 'Bergen Table x 2 = £240.00' }]);
  });
  it('refuses a blank product', () => {
    expect(() => applyProductChange(withStatuses({}), { ...txt('x'), from: null, to: ' ' })).toThrow(/nothing/i);
  });
});
