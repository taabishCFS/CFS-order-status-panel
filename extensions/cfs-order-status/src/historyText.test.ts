import { describe, expect, it } from 'vitest';
import { describeEntry, scopeLabel } from './historyText';
import type { HistoryEntry } from './types';

const by = { id: null, name: 'Sam', source: 'self-declared' as const };
const L1 = 'gid://shopify/LineItem/1';
const titleOf = (t: string) => (t === L1 ? 'Oslo Sideboard (Oak)' : 'Other');
const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({ id: 'e', at: '2026-11-19T10:00:00Z', by, scope: 'order', changes: [], ...over });

describe('scopeLabel', () => {
  it('names every entry type', () => {
    expect(scopeLabel('order')).toBe('Whole order');
    expect(scopeLabel('lines')).toBe('Selected items');
    expect(scopeLabel('expected-date')).toBe('Expected date');
    expect(scopeLabel('delivery')).toBe('Delivery confirmation');
    expect(scopeLabel('note')).toBe('Note');
    expect(scopeLabel('instructions')).toBe('Instructions');
    expect(scopeLabel('configuration')).toBe('Configuration');
    expect(scopeLabel('contact')).toBe('Contact details');
    expect(scopeLabel('tracking')).toBe('Tracking');
  });
});

describe('describeEntry', () => {
  it('describes a status entry as before, with Not set for a missing previous status', () => {
    const e = entry({ scope: 'lines', changes: [{ target: L1, fromId: null, toId: 4, toLabel: 'In Stock' }] });
    expect(describeEntry(e, titleOf)).toEqual(['Oslo Sideboard (Oak): Not set → In Stock']);
    const o = entry({ changes: [{ target: 'order', fromId: 3, toId: 6, toLabel: 'Completed' }] });
    expect(describeEntry(o, titleOf)).toEqual(['Order: Order in Progress → Completed']);
  });

  it('adds a line for an expected date cleared by In Stock', () => {
    const e = entry({
      scope: 'lines',
      changes: [{ target: L1, fromId: 3, toId: 4, toLabel: 'In Stock' }],
      values: [{ target: L1, from: '2026-12-01', to: null }],
    });
    expect(describeEntry(e, titleOf)).toEqual([
      'Oslo Sideboard (Oak): Order in Progress → In Stock',
      'Oslo Sideboard (Oak): expected date 2026-12-01 cleared',
    ]);
  });

  it('describes expected dates being set, changed and cleared', () => {
    const set = entry({ scope: 'expected-date', values: [{ target: L1, from: null, to: '2026-12-01' }] });
    expect(describeEntry(set, titleOf)).toEqual(['Oslo Sideboard (Oak): expected date none → 2026-12-01']);
    const clear = entry({ scope: 'expected-date', values: [{ target: L1, from: '2026-12-01', to: null }] });
    expect(describeEntry(clear, titleOf)).toEqual(['Oslo Sideboard (Oak): expected date 2026-12-01 → cleared']);
  });

  it('describes delivery outcomes, notes and instructions', () => {
    const d = entry({ scope: 'delivery', values: [{ target: L1, from: null, to: 'confirmed' }] });
    expect(describeEntry(d, titleOf)).toEqual(['Oslo Sideboard (Oak): delivery not set → confirmed']);
    expect(describeEntry(entry({ scope: 'note', note: 'Called customer' }), titleOf)).toEqual(['Called customer']);
    expect(describeEntry(entry({ scope: 'instructions', values: [{ target: 'order', from: null, to: 'x' }] }), titleOf)).toEqual([
      'Instructions updated',
    ]);
  });

  it('shows the extras saved with a status change (cancel reason, credit note, service remarks) under it', () => {
    const e = entry({ scope: 'lines', changes: [{ target: L1, fromId: 4, toId: 7, toLabel: 'Cancelled' }], note: 'Cancel reason: Customer changed mind' });
    expect(describeEntry(e, titleOf)).toEqual(['Oslo Sideboard (Oak): In Stock → Cancelled', 'Cancel reason: Customer changed mind']);
  });

  it('describes a tracking number change', () => {
    expect(describeEntry(entry({ scope: 'tracking', values: [{ target: 'order', from: null, to: 'GE1 2' }] }), titleOf)).toEqual(['Tracking number: none → GE1 2']);
  });

  it('describes a contact change as one line per detail, with none for a blank old value', () => {
    const e = entry({ scope: 'contact', values: [{ target: 'Email', from: null, to: 'a@new.com' }, { target: 'Shipping address', from: '1 High St', to: '2 Low Rd' }] });
    expect(describeEntry(e, titleOf)).toEqual(['Email: none → a@new.com', 'Shipping address: 1 High St → 2 Low Rd']);
  });

  it('describes a configuration change: the line, old and new options, and the note', () => {
    const e = entry({
      scope: 'configuration',
      values: [{ target: L1, from: 'Fabric: Carlton Caramel', to: 'Fabric: Carlton Black' }],
      note: 'Price difference +£140.00. Reason: Customer asked',
    });
    expect(describeEntry(e, titleOf)).toEqual([
      'Oslo Sideboard (Oak): options Fabric: Carlton Caramel → Fabric: Carlton Black',
      'Price difference +£140.00. Reason: Customer asked',
    ]);
  });
});
