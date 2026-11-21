import { conditionLabel, isCondition } from './conditions';
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

// Saves how a delayed order is handled (Update Conditions). Any refund it implies is requested separately.
export function applyCondition(state: StatusState, input: Meta & { value: string }): StatusState {
  if (!isCondition(input.value)) throw new Error('Choose one of the listed conditions');
  const values: ValueChange[] = [{ target: 'order', from: state.condition ? conditionLabel(state.condition.value) : null, to: conditionLabel(input.value) }];
  return { ...state, schemaVersion: 2, condition: { value: input.value, at: input.now, by: input.actor }, history: withEntry(state, input, 'condition', { values }) };
}

// Records that a refund was requested (the request itself is saved by the backend). Moves no money.
export function applyRefundRequest(state: StatusState, input: Meta & { summary: string; notes: string }): StatusState {
  const values: ValueChange[] = [{ target: 'order', from: null, to: input.summary }];
  const notes = input.notes.trim();
  return { ...state, schemaVersion: 2, history: withEntry(state, input, 'refund', { values, ...(notes ? { note: notes } : {}) }) };
}

const TRACKING = /^[A-Za-z0-9 \-]{3,40}$/;

// Saves the courier tracking number on the order. Sending it to the customer is a separate email request.
export function applyTracking(state: StatusState, input: Meta & { number: string }): StatusState {
  const number = input.number.trim();
  if (!TRACKING.test(number)) throw new Error('The tracking number must be 3 to 40 letters, numbers, spaces or dashes');
  const values: ValueChange[] = [{ target: 'order', from: state.tracking?.number ?? null, to: number }];
  return { ...state, schemaVersion: 2, tracking: { number, at: input.now, by: input.actor }, history: withEntry(state, input, 'tracking', { values }) };
}

// Records that contact details (email, phone, shipping address) were changed. The change itself is made by the backend.
export function applyContactChange(state: StatusState, input: Meta & { changes: { label: string; from: string | null; to: string | null }[] }): StatusState {
  if (input.changes.length === 0) throw new Error('There is nothing to record');
  const values: ValueChange[] = input.changes.map((c) => ({ target: c.label, from: c.from, to: c.to }));
  return { ...state, schemaVersion: 2, history: withEntry(state, input, 'contact', { values }) };
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
