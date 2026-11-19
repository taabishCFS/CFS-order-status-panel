import { describe, expect, it } from 'vitest';
import { deliveryOf, expectedOf } from './lineInfo';
import { emptyState } from './state';
import type { StatusState } from './types';

const by = { id: null, name: 'Sam', source: 'self-declared' as const };
const L1 = 'gid://shopify/LineItem/1';
const L2 = 'gid://shopify/LineItem/2';

describe('expectedOf and deliveryOf', () => {
  it('return null for a version 1 record', () => {
    expect(expectedOf(emptyState(), L1)).toBeNull();
    expect(deliveryOf(emptyState(), L1)).toBeNull();
  });

  it('return the stored values per line and null for a cleared date or an untouched line', () => {
    const s: StatusState = {
      ...emptyState(),
      schemaVersion: 2,
      expected: { [L1]: { date: '2026-12-01', at: 'x', by }, [L2]: { date: null, at: 'x', by } },
      delivery: { [L1]: { outcome: 'declined', at: 'x', by } },
    };
    expect(expectedOf(s, L1)).toBe('2026-12-01');
    expect(expectedOf(s, L2)).toBeNull();
    expect(deliveryOf(s, L1)).toBe('declined');
    expect(deliveryOf(s, L2)).toBeNull();
  });
});
