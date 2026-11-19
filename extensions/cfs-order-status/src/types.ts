import type { Actor } from './identity';

export type Scope = 'order' | 'lines';

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

export interface HistoryEntry {
  id: string;
  at: string;
  by: Actor;
  scope: Scope;
  changes: Change[];
}

export interface StatusState {
  schemaVersion: 1;
  order: Stamp | null;
  lines: Record<string, Stamp>;
  // Latest entries only (see RECENT_LIMIT); older ones are archived as metaobjects.
  history: HistoryEntry[];
  // Every change ever saved. Absent on orders saved before history archiving.
  totalEntries?: number;
}
