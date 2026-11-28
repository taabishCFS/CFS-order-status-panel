import db from "../db.server";
import { listServiceOrders, parseServiceOrderParams } from "../orders/service-issue-orders.server";
import { authenticate } from "../shopify.server";

// GET ?from=&to=&takenBy=&q=&page=&all=1: the items of replacement and Service Issue orders. Read only.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listServiceOrders(db, session.shop, parseServiceOrderParams(new URL(request.url).searchParams))));
};
