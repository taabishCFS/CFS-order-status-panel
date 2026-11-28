// Ordering from and chasing suppliers: the Supplier Chaseup and Date Lapsed lists, supplier details, and Process Order.
// Every call returns { ok: false, message } instead of throwing.
import type { Actor } from '../../extensions/cfs-order-status/src/identity';
import { statusById, type CfsStatus } from '../../extensions/cfs-order-status/src/statuses';
import { bulkChangeStatus, type BulkDeps } from './bulk';
import { callBackendResult } from './backend';

export type ChaseKind = 'chaseup' | 'lapsed';
export const ORDER_IN_PROGRESS = 3;

export interface ChaseRow {
  lineId: string;
  orderId: string;
  orderName: string;
  orderCreatedAt: string;
  brand: string;
  product: string;
  variantTitle: string | null;
  quantity: number;
  lineStatusId: number | null;
  expectedDate: string | null;
  deliveryOutcome: string | null;
  lastChasedAt: string | null;
  deliveryDate?: string | null; // Date Lapsed only
  deliveryBooked?: boolean;
  confirmNote?: string | null;
}
export interface ChaseList {
  rows: ChaseRow[];
  summary: { lines: number; orders: number };
  total: number;
  page: number;
  pageCount: number;
  capped: boolean;
  brands: string[];
}
export interface ChaseParams { kind: ChaseKind; brand?: string; from?: string; to?: string; page?: number }
export interface Supplier { brand: string; email: string; cc: string; handOrdered: boolean; address?: string }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; code?: string }

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can do this.',
  no_permission: 'You do not have permission for Process Order and chase-ups. Ask a manager.',
  email_off: 'Email sending is switched off for this app, so nothing was sent.',
  no_lines: 'The selected lines were not found. Refresh the list and try again.',
  unknown_template: 'The supplier email template is missing. Open Email templates and check it.',
  bad_email: 'One of the email addresses is not valid. Separate several with commas.',
  bad_request: 'The request was not accepted. Refresh the page and try again.',
};
const explain = (status: number, body: Body | null): string => EXPLAIN[body?.code ?? body?.error ?? ''] ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

function query(p: ChaseParams): URLSearchParams {
  const q = new URLSearchParams({ kind: p.kind });
  if (p.brand) q.set('brand', p.brand);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (p.page && p.page > 1) q.set('page', String(p.page));
  return q;
}

export async function loadChase(params: ChaseParams, fetchFn: typeof fetch = fetch): Promise<Result<ChaseList>> {
  try {
    const res = await callBackendResult(`/api/supplier-chase?${query(params)}`, undefined, fetchFn);
    const body = res.body as (ChaseList & Body) | null;
    return res.ok && Array.isArray(body?.rows) ? { ok: true, data: body as ChaseList } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function loadChaseExport(params: ChaseParams, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string; filename: string }>> {
  try {
    const q = query({ ...params, page: 1 });
    q.set('export', '1');
    const res = await callBackendResult(`/api/supplier-chase?${q}`, undefined, fetchFn);
    const body = res.body as ({ url?: string; filename?: string } & Body) | null;
    return res.ok && body?.url ? { ok: true, data: { url: body.url, filename: body.filename ?? 'export.csv' } } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function loadSuppliers(fetchFn: typeof fetch = fetch): Promise<Result<Supplier[]>> {
  try {
    const res = await callBackendResult('/api/suppliers', undefined, fetchFn);
    const body = res.body as ({ suppliers?: Supplier[] } & Body) | null;
    return res.ok && Array.isArray(body?.suppliers) ? { ok: true, data: body.suppliers } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function saveSupplier(s: Supplier, fetchFn: typeof fetch = fetch): Promise<Result<null>> {
  try {
    const res = await callBackendResult('/api/suppliers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }, fetchFn);
    return res.ok ? { ok: true, data: null } : { ok: false, message: explain(res.status, res.body as Body | null) };
  } catch (e) {
    return failure(e);
  }
}

export interface ProcessReply {
  emails: number;
  orders: number;
  handOrdered: number;
  noSupplier: string[];
  skipped: number;
  processedLines: { lineId: string; orderId: string }[];
  duplicate?: boolean;
}
export interface ProcessCall { action: 'order' | 'chaseup'; lineIds?: string[]; orderIds?: string[]; key: string; dryRun: boolean }

export async function callProcess(a: ProcessCall, fetchFn: typeof fetch = fetch): Promise<Result<ProcessReply>> {
  try {
    const body = { action: a.action, ...(a.orderIds ? { orderIds: a.orderIds } : { lineIds: a.lineIds }), idempotencyKey: a.key, dryRun: a.dryRun };
    const res = await callBackendResult('/api/process-order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, fetchFn);
    const reply = res.body as (ProcessReply & Body) | null;
    return res.ok && Array.isArray(reply?.processedLines) ? { ok: true, data: reply as ProcessReply } : { ok: false, message: explain(res.status, reply) };
  } catch (e) {
    return failure(e);
  }
}

/** orderId -> line ids, the shape the bulk status save wants. */
export function groupProcessed(lines: { lineId: string; orderId: string }[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const l of lines) groups.set(l.orderId, [...(groups.get(l.orderId) ?? []), l.lineId]);
  return groups;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What happened, in plain words. */
export function processText(action: 'order' | 'chaseup', r: ProcessReply, failed = 0): string {
  const parts: string[] = [];
  if (r.emails > 0) parts.push(action === 'order' ? `${plural(r.emails, 'order form')} emailed to suppliers` : `${plural(r.emails, 'chase-up email')} sent to suppliers`);
  if (action === 'order' && r.handOrdered > 0) parts.push(`${plural(r.handOrdered, 'line')} for brands ordered by hand (no email)`);
  if (r.noSupplier.length > 0) parts.push(`nothing sent for ${r.noSupplier.join(', ')}: add the supplier email on the Suppliers page`);
  if (r.skipped > 0) parts.push(`${plural(r.skipped, 'line')} skipped because their status cannot be ordered`);
  if (failed > 0) parts.push(`${plural(failed, 'order')} could not be set to Order in Progress: open and set ${failed === 1 ? 'it' : 'them'} by hand`);
  return parts.length ? `${parts.join('. ')}.` : 'Nothing to send.';
}

/**
 * Process Order for lines or whole orders: email the suppliers, then set what was processed to Order in Progress.
 * The status is only changed after the server says the emails were queued.
 */
export async function processOrder(
  a: { lineIds?: string[]; orderIds?: string[]; actor: Actor; key: string },
  deps: { call?: typeof callProcess; bulk?: typeof bulkChangeStatus; bulkDeps?: BulkDeps } = {},
): Promise<{ ok: true; tone: 'success' | 'warning'; text: string } | { ok: false; message: string }> {
  const call = deps.call ?? callProcess;
  const bulk = deps.bulk ?? bulkChangeStatus;
  const sent = await call({ action: 'order', lineIds: a.lineIds, orderIds: a.orderIds, key: a.key, dryRun: false });
  if (!sent.ok) return sent;
  let failed = 0;
  if (sent.data.processedLines.length > 0) {
    const result = await bulk({ groups: groupProcessed(sent.data.processedLines), status: statusById(ORDER_IN_PROGRESS) as CfsStatus, actor: a.actor, deps: deps.bulkDeps });
    failed = result.failed.length;
  }
  const text = processText('order', sent.data, failed);
  return { ok: true, tone: failed > 0 || sent.data.noSupplier.length > 0 ? 'warning' : 'success', text };
}
