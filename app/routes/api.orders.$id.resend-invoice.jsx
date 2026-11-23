import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { runEmailTick } from "../email/worker.server";
import { loadDocument } from "../orders/documents.server";
import { queueInvoiceEmail } from "../orders/invoice-email.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;

// Answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// POST { idempotencyKey }: emails the order's invoice to the customer (Resend Inv.). Verified staff only. Sent through the
// email queue, so it appears in the order's email log.
export const action = async ({ request, params }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!ID.test(params.id ?? "")) return json({ error: "bad_request" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const key = body?.idempotencyKey;
  if (typeof key !== "string" || key.length < 1 || key.length > 80) return json({ error: "bad_request" }, 400);

  const orderId = `gid://shopify/Order/${params.id}`;
  let found;
  try {
    found = await loadDocument(admin.graphql, db, { shop: session.shop, orderId });
  } catch (error) {
    console.error("Resend invoice: Shopify unavailable", error?.message ?? error);
    return json({ error: "shopify_unavailable" }, 502);
  }
  if (!found) return json({ error: "not_found" }, 404);

  const result = await queueInvoiceEmail(db, { shop: session.shop, orderId, ...found, staff, config: readMailConfig(process.env), idempotencyKey: key });
  if (!result.ok) return json({ error: result.code }, result.code === "email_off" ? 409 : 422);

  void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
  return json({ ok: true, recipient: result.row.recipient, status: result.row.status, duplicate: result.duplicate });
};
