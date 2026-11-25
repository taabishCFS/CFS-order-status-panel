import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { runEmailTick } from "../email/worker.server";
import { queueSupplierEmails } from "../orders/supplier-chase.server";
import { readProcessRequest } from "../orders/supplier-chase-rules";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { email_off: 409, no_lines: 404, unknown_template: 422 };

// The browser sends an OPTIONS preflight before a POST from the extension; authenticate.admin answers it.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// POST { action: "order" | "chaseup", lineIds | orderIds, idempotencyKey, dryRun? }: email the supplier order form (Process Order) or the chase-up.
// The answer lists the lines to set to Order in Progress (processedLineIds); the page does that. Needs a verified staff member with the Process Order permission.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!(await can(db, session.shop, staff, "process_order"))) return json({ error: "no_permission" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readProcessRequest(body);
  if (read.error) return json({ error: "bad_request" }, 400);

  const result = await queueSupplierEmails(db, { shop: session.shop, request: read.value, actor: staff, config: readMailConfig(process.env) });
  if (!result.ok) return json({ ok: false, code: result.code }, STATUS[result.code] ?? 400);

  const { rows, ...rest } = result;
  if (!read.value.dryRun && rows.length > 0) {
    void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
  }
  return json(rest);
};
