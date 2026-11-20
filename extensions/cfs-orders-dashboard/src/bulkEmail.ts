// Send Bulk Email on Orders by Brand: one email per customer for the ticked lines. Returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export const DEFAULT_SUBJECT = 'Update on your order {{order_numbers}}';
export const DEFAULT_MESSAGE = `Hi {{customer_name}},

We’re writing to update you about your order: {{order_numbers}}.

We’re checking the current status and will confirm the next steps shortly. If you have already received the order, please reply to let us know.

Regards,
Customer Support`;

export interface BulkRecipient {
  email: string;
  name: string;
  orders: string[];
}

export interface BulkOk {
  ok: true;
  customers: number;
  orders: number;
  withoutEmail: number;
  recipients?: BulkRecipient[];
  duplicate?: boolean;
}

export type BulkResult = BulkOk | { ok: false; message: string };

interface BulkBody {
  ok?: boolean;
  code?: string;
  error?: string;
  errors?: string[];
}

function problem(status: number, body: BulkBody | null): string {
  const code = body?.code ?? body?.error;
  switch (code) {
    case 'email_off': return 'Email sending is switched off for this app, so nothing was sent.';
    case 'no_lines': return 'The selected lines were not found. Refresh the list and try again.';
    case 'no_recipients': return 'None of the selected orders has an email address.';
    case 'bad_subject': return `The subject cannot be used: ${(body?.errors ?? []).join(' ')}`.trim();
    case 'staff_not_verified': return 'Only a verified staff member can send bulk email.';
    case 'unknown_template': return 'The bulk email template is missing. Open Email templates and check "Bulk message to customers".';
    case 'bad_request': return 'The request was not accepted. Check the subject and message and try again.';
    default: return `The server answered with status ${status}.`;
  }
}

/** dryRun asks who would be emailed and sends nothing. The key makes a repeat of the same send do nothing. */
export async function callBulkEmail(
  a: { lineIds: string[]; subject: string; message: string; key: string; dryRun: boolean },
  fetchFn: typeof fetch = fetch,
): Promise<BulkResult> {
  try {
    const res = await callBackendResult(
      'api/emails/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds: a.lineIds, subject: a.subject, message: a.message, idempotencyKey: a.key, dryRun: a.dryRun }),
      },
      fetchFn,
    );
    const body = res.body as (BulkBody & Partial<BulkOk>) | null;
    if (res.ok && body?.ok) {
      const { ok: _ok, ...rest } = body as BulkOk;
      return { ok: true, ...rest };
    }
    return { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
