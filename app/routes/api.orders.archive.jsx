import db from "../db.server";
import { archiveOrders } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));
const MAX_ORDERS = 200;
const GID = /^gid:\/\/shopify\/Order\/\d{1,20}$/;

// This loader also answers the browser's OPTIONS preflight before the extension's POST.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return json(cors, { error: "method_not_allowed" }, 405);
};

// POST { orderIds, archived }: hide orders from the lists (or bring them back). Nothing changes in Shopify.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  if (!staffFromSession(session)) return json(cors, { error: "staff_not_verified" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(cors, { error: "bad_request" }, 400);
  }
  const ids = body?.orderIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_ORDERS || !ids.every((id) => typeof id === "string" && GID.test(id)) || typeof body.archived !== "boolean") {
    return json(cors, { error: "bad_request" }, 400);
  }
  const { count } = await archiveOrders(db, session.shop, ids, body.archived);
  return json(cors, { ok: true, count });
};
