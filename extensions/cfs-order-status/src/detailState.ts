import type { Actor } from './identity';
import type { HistoryEntry, StatusState, ValueChange } from './types';

export const NOTE_MAX = 2000;
export const INSTRUCTIONS_MAX = 1000;

interface Meta {
  actor: Actor;
  now: string;
  entryId: string;
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function withEntry(state: StatusState, meta: Meta, scope: HistoryEntry['scope'], extra: Partial<HistoryEntry>): HistoryEntry[] {
  const entry: HistoryEntry = { id: meta.entryId, at: meta.now, by: meta.actor, scope, changes: [], ...extra };
  return [...state.history, entry];
}

export function applyExpectedDate(state: StatusState, input: Meta & { lineIds: string[]; date: string | null }): StatusState {
  const { lineIds, date, actor, now } = input;
  if (lineIds.length === 0) throw new Error('Select at least one item');
  if (date !== null && !validDate(date)) throw new Error('Enter a valid date');
  const expected = { ...state.expected };
  const values: ValueChange[] = [];
  for (const id of lineIds) {
    values.push({ target: id, from: state.expected?.[id]?.date ?? null, to: date });
    expected[id] = { date, at: now, by: actor };
  }
  return { ...state, schemaVersion: 2, expected, history: withEntry(state, input, 'expected-date', { values }) };
}

export function applyDelivery(
  state: StatusState,
  input: Meta & { lineIds: string[]; outcome: 'confirmed' | 'declined' },
): StatusState {
  const { lineIds, outcome, actor, now } = input;
  if (lineIds.length === 0) throw new Error('Select at least one item');
  const delivery = { ...state.delivery };
  const values: ValueChange[] = [];
  for (const id of lineIds) {
    values.push({ target: id, from: state.delivery?.[id]?.outcome ?? null, to: outcome });
    delivery[id] = { outcome, at: now, by: actor };
  }
  return { ...state, schemaVersion: 2, delivery, history: withEntry(state, input, 'delivery', { values }) };
}

export function applyNote(state: StatusState, input: Meta & { text: string }): StatusState {
  const note = input.text.trim();
  if (!note) throw new Error('Enter a note');
  if (note.length > NOTE_MAX) throw new Error(`Notes are limited to ${NOTE_MAX} characters`);
  return { ...state, schemaVersion: 2, history: withEntry(state, input, 'note', { note }) };
}

// Records that a configured line's options were changed (the change itself is made by the backend).
export function applyConfigurationChange(
  state: StatusState,
  input: Meta & { lineId: string; from: string; to: string; note: string },
): StatusState {
  const values: ValueChange[] = [{ target: input.lineId, from: input.from, to: input.to }];
  return { ...state, schemaVersion: 2, history: withEntry(state, input, 'configuration', { values, note: input.note }) };
}

export function applyInstructions(state: StatusState, input: Meta & { text: string }): StatusState {
  const text = input.text.trim();
  if (text.length > INSTRUCTIONS_MAX) throw new Error(`Instructions are limited to ${INSTRUCTIONS_MAX} characters`);
  const values: ValueChange[] = [{ target: 'order', from: state.instructions?.text ?? null, to: text || null }];
  return {
    ...state,
    schemaVersion: 2,
    instructions: text ? { text, at: input.now, by: input.actor } : null,
    history: withEntry(state, input, 'instructions', { values }),
  };
}

// The status to offer for the whole order: every current line has the same saved status and the
// order is not already at it. A line removed in an order edit does not count.
export function headerProposal(state: StatusState, currentLineIds: string[]): number | null {
  if (currentLineIds.length === 0) return null;
  const ids = new Set<number>();
  for (const id of currentLineIds) {
    const s = state.lines[id];
    if (!s) return null;
    ids.add(s.statusId);
  }
  if (ids.size !== 1) return null;
  const [only] = [...ids];
  return state.order?.statusId === only ? null : only;
}
