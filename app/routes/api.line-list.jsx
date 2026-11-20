import db from "../db.server";
import { listLines } from "../orders/list-query.server";
import { parseListParams } from "../orders/list-rules";
import { authenticate } from "../shopify.server";

// GET: the Orders by Brand line list with its summary.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseListParams(new URL(request.url).searchParams);
  return cors(Response.json(await listLines(db, session.shop, params)));
};
