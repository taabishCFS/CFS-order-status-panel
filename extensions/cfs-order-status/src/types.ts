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
  history: HistoryEntry[];
}
