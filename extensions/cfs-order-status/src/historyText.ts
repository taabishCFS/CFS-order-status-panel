import { labelFor } from './statuses';
import type { HistoryEntry, Scope } from './types';

const LABELS: Record<Scope, string> = {
  order: 'Whole order',
  lines: 'Selected items',
  'expected-date': 'Expected date',
  delivery: 'Delivery confirmation',
  note: 'Note',
  instructions: 'Instructions',
  configuration: 'Configuration',
  contact: 'Contact details',
};

export const scopeLabel = (scope: Scope): string => LABELS[scope];

// The lines shown under one history entry. `titleOf` turns a line ID into its display title.
export function describeEntry(entry: HistoryEntry, titleOf: (target: string) => string): string[] {
  const name = (target: string) => (target === 'order' ? 'Order' : titleOf(target));
  const out: string[] = [];
  for (const c of entry.changes) {
    out.push(`${name(c.target)}: ${c.fromId == null ? 'Not set' : labelFor(c.fromId)} → ${c.toLabel}`);
  }
  if (entry.scope === 'note') out.push(entry.note ?? '');
  if (entry.scope === 'instructions') out.push('Instructions updated');
  if (entry.scope === 'expected-date') {
    for (const v of entry.values ?? []) out.push(`${name(v.target)}: expected date ${v.from ?? 'none'} → ${v.to ?? 'cleared'}`);
  }
  if (entry.scope === 'delivery') {
    for (const v of entry.values ?? []) out.push(`${name(v.target)}: delivery ${v.from ?? 'not set'} → ${v.to ?? 'not set'}`);
  }
  if (entry.scope === 'configuration') {
    for (const v of entry.values ?? []) out.push(`${name(v.target)}: options ${v.from ?? 'not recorded'} → ${v.to ?? 'not recorded'}`);
    if (entry.note) out.push(entry.note);
  }
  if (entry.scope === 'contact') {
    for (const v of entry.values ?? []) out.push(`${v.target}: ${v.from ?? 'none'} → ${v.to ?? 'none'}`);
  }
  if (entry.scope === 'lines') {
    for (const v of entry.values ?? []) if (v.to === null && v.from) out.push(`${name(v.target)}: expected date ${v.from} cleared`);
  }
  return out;
}
