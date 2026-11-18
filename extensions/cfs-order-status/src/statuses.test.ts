import { describe, expect, it } from 'vitest';
import { STATUSES, labelFor, statusById } from './statuses';

describe('CFS status list', () => {
  it('has all 84 workbook rows', () => {
    expect(STATUSES).toHaveLength(84);
  });

  it('has unique IDs', () => {
    expect(new Set(STATUSES.map((s) => s.id)).size).toBe(STATUSES.length);
  });

  it('has a non-empty label on every row', () => {
    for (const s of STATUSES) expect(s.label.trim()).not.toBe('');
  });

  it.each([
    [43, 'Allocated From Stock'],
    [46, 'Collection/Display Stock'],
    [57, 'Due In Stock'],
    [19, 'Part Delivery Booked'],
    [16, 'Part Order Delivered'],
  ])('maps ID %i to the exact label %s', (id, label) => {
    expect(statusById(id)).toEqual({ id, label });
  });

  it('describes an ID that is not in the list instead of throwing', () => {
    expect(labelFor(999999)).toBe('Unknown status (ID 999999)');
    expect(labelFor(46)).toBe('Collection/Display Stock');
  });
});
