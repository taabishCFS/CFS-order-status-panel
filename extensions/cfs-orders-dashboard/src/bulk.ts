// Bulk status and expected-date saves from the Orders by Brand list. Each order is saved on its own,
// one after another, through the same record and history the Order Detail page uses.
import { applyExpectedDate } from '../../cfs-order-status/src/detailState';
import type { Actor } from '../../cfs-order-status/src/identity';
import { applyChange } from '../../cfs-order-status/src/state';
import type { CfsStatus } from '../../cfs-order-status/src/statuses';
import { loadState, type SaveResult } from '../../cfs-order-status/src/store';
import type { StatusState } from '../../cfs-order-status/src/types';
import type { LineRow } from './listApi';
import { syncOrder } from './mirrorSync';
import { saveChange } from './writes';

export interface BulkResult {
  saved: string[];
  failed: { orderId: string; message: string }[];
}

export interface BulkDeps {
  load?: (orderId: string) => Promise<{ state: StatusState; digest: string | null }>;
  save?: (orderId: string, loaded: { state: StatusState; digest: string | null }, build: (s: StatusState) => StatusState) => Promise<SaveResult>;
  sync?: (orderId: string) => Promise<void>;
  now?: () => string;
  newId?: () => string;
}

const STALE = 'Someone else changed this order. Open it and try again.';
const defaultId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** orderId -> the ticked line ids of that order, in the order the orders first appear. */
export function groupByOrder(rows: LineRow[], selected: Set<string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    if (!selected.has(r.lineId)) continue;
    groups.set(r.orderId, [...(groups.get(r.orderId) ?? []), r.lineId]);
  }
  return groups;
}

async function eachOrder(
  groups: Map<string, string[]>,
  deps: BulkDeps,
  build: (lineIds: string[], meta: { now: string; entryId: string }) => (s: StatusState) => StatusState,
): Promise<BulkResult> {
  const load = deps.load ?? ((id: string) => loadState(id));
  const save = deps.save ?? ((id, loaded, b) => saveChange(id, loaded, b));
  const sync = deps.sync ?? syncOrder;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultId;
  const result: BulkResult = { saved: [], failed: [] };

  for (const [orderId, lineIds] of groups) {
    try {
      const loaded = await load(orderId);
      const res = await save(orderId, loaded, build(lineIds, { now: now(), entryId: newId() }));
      if (res.ok) {
        result.saved.push(orderId);
        await sync(orderId);
      } else {
        result.failed.push({ orderId, message: res.reason === 'stale' ? STALE : res.message });
      }
    } catch (e) {
      result.failed.push({ orderId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

export async function bulkChangeStatus(input: { groups: Map<string, string[]>; status: CfsStatus; actor: Actor; deps?: BulkDeps }): Promise<BulkResult> {
  const { groups, status, actor, deps = {} } = input;
  // Legacy: status 1 (Payment Process) never changes a line, so it is refused instead of silently ignored.
  if (status.id === 1) {
    return { saved: [], failed: [...groups.keys()].map((orderId) => ({ orderId, message: 'Payment Process cannot be set on a line.' })) };
  }
  return eachOrder(groups, deps, (lineIds, meta) => (state) => applyChange(state, { scope: 'lines', lineIds, status, actor, ...meta }));
}

export async function bulkExpectedDate(input: { groups: Map<string, string[]>; date: string | null; actor: Actor; deps?: BulkDeps }): Promise<BulkResult> {
  const { groups, date, actor, deps = {} } = input;
  return eachOrder(groups, deps, (lineIds, meta) => (state) => applyExpectedDate(state, { lineIds, date, actor, ...meta }));
}
