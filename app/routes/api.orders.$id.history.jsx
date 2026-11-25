import db from "../db.server";
import { archiveForOrder, cleanEntries, olderForOrder } from "../orders/history-archive.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// The order must be one of this shop's, so nobody can read or write history under another order's id.
async function ownOrder(shop, id) {
  if (!/^\d{1,20}$/.test(id ?? "")) return null;
  const orderId = `gid://shopify/Order/${id}`;
  return (await db.order.findFirst({ where: { shop, orderId }, select: { orderId: true } })) ? orderId : null;
}

// GET ?after=cursor: a page of older history entries (archived as the app, since staff access cannot read them).
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  const orderId = await ownOrder(session.shop, params.id);
  if (!orderId) return json(cors, { error: "not_found" }, 404);
  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const after = new URL(request.url).searchParams.get("after");
    return json(cors, await olderForOrder(admin.graphql, orderId, after));
  } catch (error) {
    console.error(`Older history ${params.id} failed`, error?.message ?? error);
    return json(cors, { error: "shopify_unavailable" }, 502);
  }
};

// POST { entries }: archive history entries that no longer fit in the order's record. Verified staff only.
export const action = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  if (!staffFromSession(session)) return json(cors, { error: "staff_not_verified" }, 403);
  const orderId = await ownOrder(session.shop, params.id);
  if (!orderId) return json(cors, { error: "not_found" }, 404);
  let body;
  try {
    body = await request.json();
  } catch {
    return json(cors, { error: "bad_request" }, 400);
  }
  const entries = cleanEntries(body?.entries);
  if (!entries) return json(cors, { error: "bad_request" }, 400);
  try {
    const { admin } = await unauthenticated.admin(session.shop);
    const result = await archiveForOrder(admin.graphql, orderId, entries);
    return result.ok ? json(cors, { ok: true }) : json(cors, { error: "archive_failed", message: result.message }, 502);
  } catch (error) {
    console.error(`Archive ${params.id} failed`, error?.message ?? error);
    return json(cors, { error: "shopify_unavailable" }, 502);
  }
};
