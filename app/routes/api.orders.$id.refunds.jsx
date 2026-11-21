import db from "../db.server";
import { readRefundInput } from "../orders/refund-request";
import { addRefundRequest, listRefundRequests } from "../orders/refund-request.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;

// GET: the order's refund requests and what can still be asked for. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (!ID.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  return cors(Response.json(await listRefundRequests(db, session.shop, `gid://shopify/Order/${params.id}`)));
};

// POST { clientKey, reason, type, amount?, lineIds?, notes? }: add a refund request. Verified staff only. Moves no money.
export const action = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
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
  const read = readRefundInput(body);
  if (read.error) return json({ error: read.error }, 400);

  const result = await addRefundRequest(db, { shop: session.shop, orderId: `gid://shopify/Order/${params.id}`, input: read.value, actor: staff });
  if (result.ok) return json({ ok: true, request: result.request });
  if (result.code === "too_much") return json({ error: "too_much", refundableMinor: result.refundableMinor }, 422);
  return json({ error: result.code }, 404);
};
