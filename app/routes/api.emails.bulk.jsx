import db from "../db.server";
import { queueBulkEmails, readBulkRequest } from "../email/bulk-email.server";
import { readMailConfig } from "../email/config.server";
import { runEmailTick } from "../email/worker.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { email_off: 409, no_lines: 404, no_recipients: 422, bad_subject: 422, unknown_template: 422 };

// The browser sends an OPTIONS preflight before a POST from the extension; authenticate.admin answers it.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// POST { lineIds, subject, message, idempotencyKey, dryRun? }: one email per customer for the selected lines.
// dryRun lists who would be emailed and sends nothing. Needs a verified staff member.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readBulkRequest(body);
  if (read.error) return json({ error: "bad_request" }, 400);

  const result = await queueBulkEmails(db, { shop: session.shop, request: read.value, actor: staff, config: readMailConfig(process.env) });
  if (!result.ok) return json({ ok: false, code: result.code, errors: result.errors, withoutEmail: result.withoutEmail }, STATUS[result.code] ?? 400);

  const { rows, ...rest } = result;
  if (!read.value.dryRun) {
    // Send now rather than waiting for the next worker pass. A failure here is recorded on the rows.
    void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
  }
  return json({ ...rest });
};
