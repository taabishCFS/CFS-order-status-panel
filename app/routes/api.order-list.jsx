import db from "../db.server";
import { listOrders } from "../orders/list-query.server";
import { parseListParams } from "../orders/list-rules";
import { authenticate } from "../shopify.server";

// GET: one page of the By Order list. This loader also answers the browser's preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseListParams(new URL(request.url).searchParams);
  return cors(Response.json(await listOrders(db, session.shop, params)));
};
