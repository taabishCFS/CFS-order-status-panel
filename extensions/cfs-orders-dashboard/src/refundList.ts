// The accounts refund list (legacy Refund Orders List). Accounts refund in the payment provider, then save the transaction ID here,
// which marks the request refunded. Every call returns { ok: false, message } instead of throwing.
import { applyRefundRequest } from '../../cfs-order-status/src/detailState';
import type { Actor } from '../../cfs-order-status/src/identity';
import { loadState, type SaveResult } from '../../cfs-order-status/src/store';
import type { StatusState } from '../../cfs-order-status/src/types';
import { callBackendResult } from './backend';
import { syncOrder } from './mirrorSync';
import { moneyText, reasonLabel } from './refunds';
import { saveChange } from './writes';

export type View = 'pending' | 'refunded' | 'all';
export type SortKey = 'added' | 'order' | 'reason' | 'notes' | 'amount' | 'refunded';

export interface RefundFilters {
  page?: number;
  all?: boolean;
  from?: string;
  to?: string;
  q?: string;
  view?: 'pending' | 'refunded' | null;
  sort?: SortKey | null;
  dir?: 'asc' | 'desc';
}

export interface RefundListRow {
  id: string;
  orderId: string;
  orderName: string;
  orderDate: string | null;
  createdAt: string;
  type: 'part' | 'full';
  reason: string;
  notes: string;
  amountMinor: number;
  paidMinor: number | null;
  currency: string;
  gateway: string | null;
  status: 'requested' | 'done';
  transactionId: string | null;
  refundedAt: string | null;
  refundedBy: string | null;
  addedBy: string | null;
  manual: boolean;
  claimable: 'claimable' | 'non_claimable' | null;
  claimableApplies: boolean;
}

export interface RefundListData {
  rows: RefundListRow[];
  total: number;
  page: number;
  pageCount: number;
  capped: boolean;
  view: View;
}

export function buildRefundQuery(f: RefundFilters): string {
  const parts: string[] = [];
  const add = (key: string, value: string | number | null | undefined) => {
    if (value !== undefined && value !== null && value !== '') parts.push(`${key}=${encodeURIComponent(String(value))}`);
  };
  add('page', f.page);
  if (f.all) add('all', 1);
  add('from', f.from);
  add('to', f.to);
  add('q', f.q);
  add('view', f.view);
  add('sort', f.sort);
  add('dir', f.dir);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const titleFor = (view: View): string => (view === 'pending' ? 'Pending refunds' : view === 'refunded' ? 'Refunded' : 'Refunds');

/** The "Refunded : Yes / Trans. ID" lines. A refunded request with no transaction ID is flagged, as the legacy list flags it in red. */
export const refundedText = (r: { status: string; transactionId: string | null }) => ({
  refunded: r.status === 'done' ? 'Yes' : '',
  transaction: r.transactionId ?? '',
  missingId: r.status === 'done' && !r.transactionId,
});

export const claimOptions: { value: string; label: string }[] = [
  { value: '', label: 'Claim?' },
  { value: 'claimable', label: 'Claimable' },
  { value: 'non_claimable', label: 'Non Claimable' },
];

/** Clicking a column heading: the same column flips direction, a new one starts newest or highest first. */
export const sortLink = (current: { sort: SortKey | null | undefined; dir: 'asc' | 'desc' | undefined }, key: SortKey): { sort: SortKey; dir: 'asc' | 'desc' } =>
  ({ sort: key, dir: current.sort === key && current.dir === 'desc' ? 'asc' : 'desc' });

/** Legacy download icon: with both dates and a view chosen it exports everything shown, otherwise the ticked rows. */
export function exportChoice(f: { from?: string; to?: string; view?: string | null }, ids: string[]): { kind: 'filtered' } | { kind: 'selected'; ids: string[] } | { message: string } {
  if (f.from && f.to && f.view) return { kind: 'filtered' };
  return ids.length ? { kind: 'selected', ids } : { message: 'Please select record(s) to export.' };
}

export const historySummary = (r: { amountMinor: number; reason: string; transactionId: string }): string =>
  `Refunded £${moneyText(r.amountMinor)} (Trans. ID ${r.transactionId}): ${reasonLabel(r.reason)}`;

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change the refund list.',
  bad_transaction_id: 'Enter the transaction ID from the payment provider.',
  already_refunded: 'This request already has a transaction ID.',
  no_request: 'That refund request is no longer on the list. Refresh the page.',
  no_order: 'No order found with that order number.',
  not_applicable: 'Claimable only applies to refunded damaged and manufacturing-defect requests.',
  bad_reason: 'Select a refund reason.',
  bad_type: 'Select a refund type.',
  bad_order: 'Add the order number.',
  bad_amount: 'Add the refund amount in pounds and pence, like 25.50.',
  bad_notes: 'Add refund notes (up to 1000 characters).',
  nothing_selected: 'Please select record(s) to remove.',
};
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });
const explain = (status: number, body: { error?: string } | null) => (body?.error && EXPLAIN[body.error]) || `The server answered with status ${status}.`;

export async function loadRefundList(f: RefundFilters, fetchFn: typeof fetch = fetch): Promise<{ ok: true; data: RefundListData } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`/api/refunds${buildRefundQuery(f)}`, undefined, fetchFn);
    const body = res.body as (RefundListData & { error?: string }) | null;
    return res.ok && body?.rows ? { ok: true, data: body } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export type RefundAction =
  | { action: 'markRefunded'; id: string; transactionId: string }
  | { action: 'claimable'; id: string; value: string }
  | { action: 'remove'; ids: string[] }
  | { action: 'add'; clientKey: string; orderName: string; reason: string; type: string; amount: string; notes: string; transactionId: string };

export async function refundAction(a: RefundAction | Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<{ ok: true; body: any } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/refunds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }, fetchFn);
    const body = res.body as { ok?: boolean; error?: string } | null;
    return res.ok && body?.ok ? { ok: true, body } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export interface RefundLink {
  url: string;
  filename: string;
}

/** A short-lived download link: the ticked rows, everything the filters show, or the Xero credit notes for two days. */
export async function loadRefundExportLink(choice: { kind: 'selected'; ids: string[] } | { kind: 'filtered'; filters: RefundFilters } | { kind: 'xero'; from: string; to: string }, fetchFn: typeof fetch = fetch): Promise<{ ok: true; data: RefundLink } | { ok: false; message: string }> {
  const query =
    choice.kind === 'selected' ? `kind=selected&ids=${encodeURIComponent(choice.ids.join(','))}` :
    choice.kind === 'xero' ? `kind=xero&from=${encodeURIComponent(choice.from)}&to=${encodeURIComponent(choice.to)}` :
    `kind=filtered${buildRefundQuery({ ...choice.filters, page: undefined, all: false }).replace('?', '&')}`;
  try {
    const res = await callBackendResult(`/api/refund-export?${query}`, undefined, fetchFn);
    const body = res.body as (RefundLink & { error?: string }) | null;
    return res.ok && body?.url ? { ok: true, data: { url: body.url, filename: body.filename } } : { ok: false, message: body?.error === 'staff_not_verified' ? 'Only a verified staff member can download exports.' : explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export interface RecordDeps {
  load?: (orderId: string) => Promise<{ state: StatusState; digest: string | null }>;
  save?: (orderId: string, loaded: { state: StatusState; digest: string | null }, build: (s: StatusState) => StatusState) => Promise<SaveResult>;
  sync?: (orderId: string) => Promise<void>;
  now?: () => string;
  newId?: () => string;
}

const defaultId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Puts "Refunded £x (Trans. ID ...)" in the order's history (the legacy "Refunded" order notification). The list has already saved the refund. */
export async function recordRefunded(req: { orderId: string; amountMinor: number; reason: string; transactionId: string }, actor: Actor, deps: RecordDeps = {}): Promise<{ ok: true } | { ok: false; message: string }> {
  const load = deps.load ?? ((id: string) => loadState(id));
  const save = deps.save ?? ((id, loaded, build) => saveChange(id, loaded, build));
  const sync = deps.sync ?? syncOrder;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? defaultId;
  try {
    const loaded = await load(req.orderId);
    const res = await save(req.orderId, loaded, (state) => applyRefundRequest(state, { summary: historySummary(req), notes: '', actor, now: now(), entryId: newId() }));
    if (!res.ok) return { ok: false, message: res.reason === 'stale' ? 'Someone else changed this order, so its history entry was not recorded.' : res.message };
    await sync(req.orderId);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
