import db from "../db.server";
import { dashboardCounts } from "../orders/dashboard-counts.server";
import { authenticate } from "../shopify.server";

// GET: the live numbers for the Dashboard tiles. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await dashboardCounts(db, session.shop)));
};
