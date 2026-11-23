import db from "../db.server";
import { parseRefundListParams, readManualInput, readRefundAction } from "../orders/refund-list";
import { addManualRefund, listRefunds, markRefunded, removeRefunds, setClaimable } from "../orders/refund-list.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { no_order: 404, no_request: 404, already_refunded: 409, not_applicable: 422 };

// GET: one page of the accounts refund list. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listRefunds(db, session.shop, parseRefundListParams(new URL(request.url).searchParams))));
};

// POST { action: "markRefunded", id, transactionId } | { action: "claimable", id, value } | { action: "remove", ids } | { action: "add", ...manual entry }.
// Verified staff only. Accounts refund in the payment provider; nothing here moves money.
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
  const shop = session.shop;
  const done = (result) => (result.ok ? json(result) : json({ error: result.code }, STATUS[result.code] ?? 400));

  if (body?.action === "add") {
    const read = readManualInput(body);
    if (read.error) return json({ error: read.error }, 400);
    return done(await addManualRefund(db, { shop, input: read.value, actor: staff }));
  }
  const read = readRefundAction(body);
  if (read.error) return json({ error: read.error }, 400);
  const a = read.value;
  if (a.action === "markRefunded") return done(await markRefunded(db, { shop, id: a.id, transactionId: a.transactionId, actor: staff }));
  if (a.action === "claimable") return done(await setClaimable(db, { shop, id: a.id, value: a.value }));
  return done(await removeRefunds(db, { shop, ids: a.ids, actor: staff }));
};
