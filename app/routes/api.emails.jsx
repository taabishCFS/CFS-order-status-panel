import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { queueOrderEmails } from "../email/queue-order-emails.server";
import { readEmailRequest } from "../email/request.server";
import { runEmailTick } from "../email/worker.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// The browser sends an OPTIONS preflight before a POST from the extension. React Router gives that
// to a loader, and authenticate.admin answers it. Without this the browser reports "Failed to fetch".
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// Queues the emails for a status save or a chosen template. Needs a verified staff member.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));

  const staff = staffFromSession(session);
  if (!staff) return cors(Response.json({ error: "staff_not_verified" }, { status: 403 }));

  let body;
  try {
    body = await request.json();
  } catch {
    return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  }
  const read = readEmailRequest(body);
  if (read.error) return cors(Response.json({ error: "bad_request" }, { status: 400 }));

  const result = await queueOrderEmails(db, {
    shop: session.shop,
    orderId: read.value.orderId,
    request: read.value,
    actor: staff,
    config: readMailConfig(process.env),
  });
  if (!result.ok) {
    const status = { email_off: 409, no_order: 404, unknown_template: 422, nothing_to_send: 200 }[result.code] ?? 400;
    return cors(Response.json({ ok: result.code === "nothing_to_send", rows: [], code: result.code }, { status }));
  }

  // Send now rather than waiting for the next worker pass. A failure here is recorded on the rows.
  void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
  return cors(Response.json({ ok: true, rows: result.rows.map(summary), duplicate: result.duplicate }));
};

const summary = (r) => ({ id: r.id, kind: r.kind, templateKey: r.templateKey, recipient: r.recipient, subject: r.subject, status: r.status, error: r.error });
