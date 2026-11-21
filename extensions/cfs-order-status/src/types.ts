import type { Actor } from './identity';

export type StatusScope = 'order' | 'lines';
export type Scope = StatusScope | 'expected-date' | 'delivery' | 'note' | 'instructions' | 'configuration' | 'contact';

export interface Stamp {
  statusId: number;
  label: string;
  at: string;
  by: Actor;
}

export interface Change {
  target: 'order' | string;
  fromId: number | null;
  toId: number;
  toLabel: string;
}

// A change to a value other than a status (expected date, delivery outcome, instructions). For a
// contact change the target is the label of the detail (Email, Shipping address) instead of a line.
export interface ValueChange {
  target: 'order' | string;
  from: string | null;
  to: string | null;
}

export interface HistoryEntry {
  id: string;
  at: string;
  by: Actor;
  scope: Scope;
  changes: Change[];
  values?: ValueChange[];
  note?: string;
}

export interface DatedStamp {
  date: string | null;
  at: string;
  by: Actor;
}

export interface DeliveryStamp {
  outcome: 'confirmed' | 'declined';
  at: string;
  by: Actor;
}

export interface Instructions {
  text: string;
  at: string;
  by: Actor;
}

export interface StatusState {
  // 1 = statuses and history only. 2 adds the optional fields below; version 1 records still load.
  schemaVersion: 1 | 2;
  order: Stamp | null;
  lines: Record<string, Stamp>;
  // Latest entries only (see RECENT_LIMIT); older ones are archived as metaobjects.
  history: HistoryEntry[];
  // Every change ever saved. Absent on orders saved before history archiving.
  totalEntries?: number;
  expected?: Record<string, DatedStamp>;
  delivery?: Record<string, DeliveryStamp>;
  instructions?: Instructions | null;
}
