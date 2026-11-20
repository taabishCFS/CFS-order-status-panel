import db from "../db.server";
import { retryEmail } from "../email/outbox.server";
import { runEmailTick } from "../email/worker.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// The browser sends an OPTIONS preflight before a POST from the extension (see api.emails.jsx).
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// Puts a failed email back in the queue. Only failed emails can be retried.
export const action = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
  if (!staffFromSession(session)) return cors(Response.json({ error: "staff_not_verified" }, { status: 403 }));
  if (!/^[\w-]{1,64}$/.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));

  const result = await retryEmail(db, { shop: session.shop, id: params.id });
  if (!result.ok) return cors(Response.json({ error: "not_retryable" }, { status: 409 }));
  void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
  return cors(Response.json({ ok: true }));
};
