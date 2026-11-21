import type { Actor } from './identity';
import type { CfsStatus } from './statuses';
import type { Change, RefundFlag, StatusExtras, StatusScope, StatusState, ValueChange } from './types';

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
  extras?: StatusExtras;
  // Every current line of the order, so a cancel can tell a full refund from a part one.
  allLineIds?: string[];
}

const EXTRA_MAX = 500;

// Keeps only the extras that belong to this status, trimmed and checked. Returns undefined when nothing is left.
function cleanExtras(statusId: number, raw: StatusExtras | undefined): { extras?: StatusExtras; note?: string } {
  const out: StatusExtras = {};
  const notes: string[] = [];
  const text = (value: string | undefined, what: string) => {
    const t = (value ?? '').trim();
    if (t.length > EXTRA_MAX) throw new Error(`${what} is limited to ${EXTRA_MAX} characters`);
    return t;
  };
  if (statusId === 7) {
    const t = text(raw?.cancelReason, 'The cancel reason');
    if (t) { out.cancelReason = t; notes.push(`Cancel reason: ${t}`); }
  }
  if (statusId === 15) {
    const t = text(raw?.serviceRemarks, 'Service remarks');
    if (t) { out.serviceRemarks = t; notes.push(`Service remarks: ${t}`); }
  }
  if (statusId === 21) {
    const t = (raw?.creditNoteAmount ?? '').replace(/[£,\s]/g, '');
    if (t) {
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) throw new Error('The credit note amount must be pounds and pence, like 125.50');
      out.creditNoteAmount = Number(t).toFixed(2);
      notes.push(`Credit note amount: ${out.creditNoteAmount}`);
    }
  }
  return Object.keys(out).length ? { extras: out, note: notes.join('. ') } : {};
}

export function applyChange(state: StatusState, input: ChangeInput): StatusState {
  const { scope, lineIds, status, actor, now, entryId } = input;
  if (scope === 'lines' && lineIds.length === 0) throw new Error('Select at least one item');

  const { extras, note } = cleanExtras(status.id, input.extras);
  const stamp = { statusId: status.id, label: status.label, at: now, by: actor, ...(extras ? { extras } : {}) };
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

  // Cancelling raises a refund flag: full when the whole order or every line is cancelled, otherwise part.
  let refund: RefundFlag | undefined;
  if (status.id === 7) {
    const all = input.allLineIds ?? [];
    const full = scope === 'order' || (all.length > 0 && all.every((id) => lines[id]?.statusId === 7));
    refund = { type: full ? 'full' : 'part', reason: extras?.cancelReason ?? state.refund?.reason ?? null, at: now, by: actor };
  }

  const entry = { id: entryId, at: now, by: actor, scope, changes, ...(values.length ? { values } : {}), ...(note ? { note } : {}) };
  return {
    ...state,
    ...(values.length || extras || refund ? { schemaVersion: 2 as const } : {}),
    ...(values.length ? { expected } : {}),
    ...(refund ? { refund } : {}),
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
