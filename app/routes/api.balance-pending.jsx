import db from "../db.server";
import { listBalancePending, parseBalancePendingParams } from "../orders/balance-pending.server";
import { authenticate } from "../shopify.server";

// GET ?page=&all=1&status=&q=: the Balance Pending list (every order that still owes money). Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listBalancePending(db, session.shop, parseBalancePendingParams(new URL(request.url).searchParams))));
};
