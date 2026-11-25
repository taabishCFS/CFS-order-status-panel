// Mark Completed on the Delivery Booked page: the ticked lines get status Completed (6), order by order, through the same record
// and history the Order Detail page uses. The customers are emailed only when asked.
import type { Actor } from '../../cfs-order-status/src/identity';
import { applyChange } from '../../cfs-order-status/src/state';
import { statusById } from '../../cfs-order-status/src/statuses';
import { loadState, type SaveResult } from '../../cfs-order-status/src/store';
import type { StatusState } from '../../cfs-order-status/src/types';
import { emailRequest, queueEmail, statusEmailInput } from './emails';
import { syncOrder } from './mirrorSync';
import { saveChange } from './writes';

export const COMPLETED = 6;

export interface MarkResult {
  saved: string[];
  failed: { orderId: string; message: string }[];
  emailed: number; // orders whose customer email was queued
  emailProblems: string[]; // why an email was not queued (the status was still saved)
}

export interface MarkDeps {
  load?: (orderId: string) => Promise<{ state: StatusState; digest: string | null }>;
  save?: (orderId: string, loaded: { state: StatusState; digest: string | null }, build: (s: StatusState) => StatusState) => Promise<SaveResult>;
  sync?: (orderId: string) => Promise<void>;
  email?: (body: Record<string, unknown>) => Promise<{ ok: boolean; message?: string; recipients?: string[] }>;
  now?: () => string;
  newId?: () => string;
}

const STALE = 'Someone else changed this order. Open it and try again.';
const defaultId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** orderId -> the ticked line ids of that order (first appearance order). */
export function groupLines(rows: { orderId: string; lineId: string }[], ticked: Set<string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const r of rows) if (ticked.has(r.lineId)) groups.set(r.orderId, [...(groups.get(r.orderId) ?? []), r.lineId]);
  return groups;
}

export async function markCompleted(input: { groups: Map<string, string[]>; actor: Actor; email: boolean; deps?: MarkDeps }): Promise<MarkResult> {
  const { groups, actor, email, deps = {} } = input;
  const load = deps.load ?? ((id: string) => loadState(id));
  const save = deps.save ?? ((id, loaded, build) => saveChange(id, loaded, build));
  const sync = deps.sync ?? syncOrder;
  const sendEmail = deps.email ?? queueEmail;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultId;
  const status = statusById(COMPLETED);
  const result: MarkResult = { saved: [], failed: [], emailed: 0, emailProblems: [] };
  if (!status) throw new Error('The Completed status is missing.');

  for (const [orderId, lineIds] of groups) {
    try {
      const loaded = await load(orderId);
      const allLineIds = [...new Set([...Object.keys(loaded.state.lines), ...lineIds])];
      // Work out the email from the record as it is now, before the save changes it.
      const mail = statusEmailInput({ state: loaded.state, allLineIds, scope: 'lines', lineIds, statusId: status.id });
      let changeId = '';
      const res = await save(orderId, loaded, (state) => {
        changeId = newId();
        return applyChange(state, { scope: 'lines', lineIds, status, actor, allLineIds, now: now(), entryId: changeId });
      });
      if (!res.ok) {
        result.failed.push({ orderId, message: res.reason === 'stale' ? STALE : res.message });
        continue;
      }
      result.saved.push(orderId);
      await sync(orderId);
      if (email) {
        const sent = await sendEmail(emailRequest({ orderId, statusId: status.id, ...mail, changeId }));
        if (sent.ok && sent.recipients?.length) result.emailed += 1;
        else result.emailProblems.push(sent.ok ? 'an order has no customer email address' : sent.message ?? 'the email could not be queued');
      }
    } catch (e) {
      result.failed.push({ orderId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/** The sentence shown after the save. */
export function markCompletedText(r: MarkResult, email: boolean): string {
  const n = r.saved.length;
  const base = `Marked Completed: ${n} order${n === 1 ? '' : 's'}.`;
  if (!email) return `${base} The customers were not emailed.`;
  const problems = [...new Set(r.emailProblems.map((p) => p.replace(/\.$/, '')))];
  const sent = `${r.emailed} customer email${r.emailed === 1 ? '' : 's'} queued.`;
  return problems.length ? `${base} ${sent} Not emailed: ${problems.join('; ')}.` : `${base} ${sent}`;
}
