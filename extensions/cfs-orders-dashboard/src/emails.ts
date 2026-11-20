// Pure helpers for customer emails on Order Detail: what to ask the backend for, and plain-English text
// for the result and the list. The backend decides who gets what; nothing here sends anything itself.
import type { StatusState } from '../../cfs-order-status/src/types';
import { callBackendResult } from './backend';

const COLLECTION_STATUS = 31;

const LABELS: Record<string, string> = {
  'status.1': 'Processed',
  'status.3': 'Order in progress',
  'status.4': 'Item(s) in stock',
  'status.6': 'Completed',
  'status.7': 'Cancelled',
  'status.8': 'On hold',
  'status.10': 'Items delayed',
  'status.14': 'Item(s) in stock',
  'status.15': 'Service issue acknowledgement',
  'status.18': 'Delivery booking confirmation',
  'status.19': 'Part delivery booked',
  'status.23': 'Part refund processed',
  'status.31': 'Collection booked',
  'status.34': 'Items discontinued',
  'status.36': 'Direct home delivery',
  'status.38': 'Delivery booking request',
  'delivery.prebooked': 'Pre-booked delivery',
  'delivery.booking_confirmation': 'Delivery booking confirmation',
  tracking: 'Tracking details',
  'delivery.confirmed': 'Delivery confirmed',
  'delivery.update': 'Delivery update',
  'enquiry.reply': 'Ticket reply',
  invoice: 'Order invoice',
  expected_date: 'Expected date',
};

const STATUS_WORDS: Record<string, string> = { queued: 'Queued', sending: 'Sending', sent: 'Sent', failed: 'Failed', skipped: 'Skipped' };

export const templateLabel = (key: string): string => LABELS[key] ?? key;

export interface StatusEmailInput {
  lineIds: string[];
  previousStatusByLine: Record<string, number | null>;
  collectionLineIds: string[];
}

// What the backend needs to apply the legacy sending rules: which lines, what each was before, and which
// lines of the order are in collection status once this save is done.
export function statusEmailInput(args: {
  state: StatusState;
  allLineIds: string[];
  scope: 'order' | 'lines';
  lineIds: string[];
  statusId: number;
}): StatusEmailInput {
  const { state, allLineIds, scope, statusId } = args;
  const lineIds = scope === 'order' ? allLineIds : args.lineIds;
  const before = (id: string): number | null => state.lines[id]?.statusId ?? null;
  const previousStatusByLine = Object.fromEntries(lineIds.map((id) => [id, before(id)]));
  const after = (id: string): number | null => (scope === 'lines' && args.lineIds.includes(id) ? statusId : before(id));
  const collectionLineIds = allLineIds.filter((id) => after(id) === COLLECTION_STATUS);
  return { lineIds, previousStatusByLine, collectionLineIds };
}

export function emailRequest(args: {
  orderId: string;
  statusId?: number;
  templateKey?: string;
  lineIds: string[];
  previousStatusByLine?: Record<string, number | null>;
  collectionLineIds?: string[];
  extras?: Record<string, string>;
  lineExtras?: Record<string, Record<string, string>>;
  changeId: string;
}): Record<string, unknown> {
  const { orderId, statusId, templateKey, changeId, ...rest } = args;
  return {
    orderId: orderId.split('/').pop(),
    ...(statusId !== undefined ? { statusId } : { templateKey }),
    ...rest,
    idempotencyKey: changeId,
  };
}

export function emailOutcomeText(problem: { code?: string; error?: string | null; network?: boolean }): string {
  if (problem.network) return 'Could not reach the backend to send the email.';
  if (problem.error === 'no_recipient') return 'This order has no email address, so nothing was sent.';
  switch (problem.code) {
    case 'email_off':
      return 'Customer email is turned off on the backend.';
    case 'no_order':
      return 'This order has not been synced to the backend yet, so it could not be emailed. Try again shortly.';
    case 'staff_not_verified':
      return 'Shopify did not say who is signed in, so the email was not queued (a verified staff member is needed).';
    case 'unknown_template':
      return 'That email template does not exist.';
    case 'bad_request':
      return 'The email request was not valid.';
    default:
      return problem.code ? `The email could not be queued (${problem.code}).` : 'The email could not be queued.';
  }
}

// Queues the email. A refusal or a network failure becomes a message; nothing is thrown.
export async function queueEmail(
  body: Record<string, unknown>,
  call: typeof callBackendResult = callBackendResult,
): Promise<{ ok: boolean; message?: string; recipients?: string[] }> {
  let result;
  try {
    result = await call('api/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: emailOutcomeText({ network: true }) };
  }
  if (result.ok) {
    const rows = (result.body as { rows?: { kind: string; recipient: string | null }[] } | null)?.rows ?? [];
    return { ok: true, recipients: rows.filter((r) => r.kind === 'customer' && r.recipient).map((r) => r.recipient as string) };
  }
  const code = (result.body as { code?: string; error?: string } | null)?.code ?? (result.body as { error?: string } | null)?.error;
  return { ok: false, message: emailOutcomeText({ code }) };
}

export interface EmailRow {
  templateKey: string;
  recipient: string | null;
  status: string;
  createdAt: string;
  error: string | null;
  kind: string;
  mode?: string | null;
}

const SKIP_REASON: Record<string, string> = {
  no_recipient: 'no email address on the order',
  not_on_allowlist: 'test mode: address not on the allowlist',
};

export function describeEmail(row: EmailRow): string {
  const when = new Date(row.createdAt).toLocaleString('en-GB');
  const copy = row.kind === 'internal_copy' ? ' (internal copy)' : '';
  const to = row.recipient ?? 'no email address';
  const word = STATUS_WORDS[row.status] ?? row.status;
  // Log mode records the email but sends nothing; test mode really sends, but only to allowed addresses.
  const status = row.status === 'sent' && row.mode === 'log' ? 'Logged only (not sent)' : row.status === 'sent' && row.mode === 'test' ? 'Sent (test mode)' : word;
  const detail =
    row.status === 'skipped' && row.error
      ? ` — ${SKIP_REASON[row.error] ?? row.error}`
      : row.status === 'failed' && row.error
        ? ` — ${row.error}`
        : '';
  return `${templateLabel(row.templateKey)}${copy} · ${when} · ${to} · ${status}${detail}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 2026-11-30 -> 30-Nov-2026, the date style of the legacy emails.
export function emailDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : iso;
}
