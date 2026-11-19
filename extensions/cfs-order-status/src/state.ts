import type { Actor } from './identity';
import type { CfsStatus } from './statuses';
import type { Change, StatusScope, StatusState, ValueChange } from './types';

export function emptyState(): StatusState {
  return { schemaVersion: 1, order: null, lines: {}, history: [] };
}

export interface ChangeInput {
  scope: StatusScope;
  lineIds: string[];
  status: CfsStatus;
  actor: Actor;
  now: string;
  entryId: string;
}

export function applyChange(state: StatusState, input: ChangeInput): StatusState {
  const { scope, lineIds, status, actor, now, entryId } = input;
  if (scope === 'lines' && lineIds.length === 0) throw new Error('Select at least one item');

  const stamp = { statusId: status.id, label: status.label, at: now, by: actor };
  const changes: Change[] = [];
  let order = state.order;
  const lines = { ...state.lines };
  let expected = state.expected;
  const values: ValueChange[] = [];

  if (scope === 'order') {
    changes.push({ target: 'order', fromId: state.order?.statusId ?? null, toId: status.id, toLabel: status.label });
    order = stamp;
  } else {
    for (const lineId of lineIds) {
      changes.push({ target: lineId, fromId: state.lines[lineId]?.statusId ?? null, toId: status.id, toLabel: status.label });
      lines[lineId] = stamp;
      // In Stock means the goods are here, so any expected arrival date no longer applies.
      const previous = state.expected?.[lineId]?.date;
      if (status.id === 4 && previous) {
        expected = { ...expected, [lineId]: { date: null, at: now, by: actor } };
        values.push({ target: lineId, from: previous, to: null });
      }
    }
  }

  const entry = { id: entryId, at: now, by: actor, scope, changes, ...(values.length ? { values } : {}) };
  return {
    ...state,
    ...(values.length ? { schemaVersion: 2 as const, expected } : {}),
    order,
    lines,
    history: [...state.history, entry],
  };
}

export function reconcileLines(
  state: StatusState,
  currentLineIds: string[],
): { active: string[]; removed: string[] } {
  const current = new Set(currentLineIds);
  return {
    active: currentLineIds,
    removed: Object.keys(state.lines).filter((id) => !current.has(id)),
  };
}
