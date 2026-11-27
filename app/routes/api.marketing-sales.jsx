import db from "../db.server";
import { marketingReport, parseMarketingParams } from "../orders/marketing-sales.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET with the report filters: the Marketing Sales Report. Read only, for verified staff with the Marketing sales permission
// (the old menu showed it to two staff groups only). This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified", message: "Your Shopify staff account could not be verified." }, 403);
  if (!(await can(db, session.shop, staff, "marketing_sales"))) return json({ error: "no_permission", message: "You do not have permission to see the Marketing Sales Report." }, 403);
  const read = parseMarketingParams(new URL(request.url).searchParams);
  if (read.error) return json({ error: "bad_filters", message: read.error }, 400);
  return json(await marketingReport(db, admin.graphql, session.shop, read.value));
};
