import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { runEmailTick } from "../email/worker.server";
import { buildBatch, readBatchInput, sendBatch } from "../orders/payment-batch.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { no_lines: 404, one_brand: 400, no_cost: 422, no_email: 422, email_off: 409, unknown_template: 422 };

// The browser sends an OPTIONS preflight before a POST; authenticate.admin answers it.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// POST { op: "draft", lineIds, invoiceNo }: the payment advice for review (changes nothing).
// POST { op: "send", lineIds, invoiceNo, idempotencyKey }: stamp the batch invoice number on the lines and email the supplier.
// Verified staff with the Pay suppliers permission.
export const action = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified", message: "Your Shopify staff account could not be verified." }, 403);
  if (!(await can(db, session.shop, staff, "pay_suppliers"))) return json({ error: "no_permission", message: "You do not have permission to pay suppliers." }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readBatchInput(body);
  if (read.error) return json({ error: read.error, message: read.message }, 400);
  const v = read.value;

  if (v.op === "draft") {
    const draft = await buildBatch(db, admin.graphql, session.shop, v);
    return draft.ok ? json(draft) : json({ error: draft.code, message: draft.message }, STATUS[draft.code] ?? 400);
  }
  const sent = await sendBatch(db, { shop: session.shop, graphql: admin.graphql, request: v, actor: staff, config: readMailConfig(process.env) });
  if (!sent.ok) return json({ error: sent.code, message: sent.message }, STATUS[sent.code] ?? 400);
  if (sent.queued > 0) void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
  return json(sent);
};
