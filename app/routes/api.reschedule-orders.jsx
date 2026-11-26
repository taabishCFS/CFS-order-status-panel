import db from "../db.server";
import { listReschedules, parseRescheduleParams } from "../orders/reschedule-orders.server";
import { authenticate } from "../shopify.server";

// GET ?brand=&from=&to=&q=&page=&all=1: Reschedule Delivery Orders (lines with a reschedule charge). Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listReschedules(db, session.shop, parseRescheduleParams(new URL(request.url).searchParams))));
};
