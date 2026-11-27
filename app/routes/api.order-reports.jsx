import db from "../db.server";
import { orderReport, parseOrderReportParams } from "../orders/order-reports.server";
import { authenticate } from "../shopify.server";

// GET ?from=&to=&statuses=&sort=&dir=&page=: the Order Reports page (summary, charts, one page of orders). Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const p = parseOrderReportParams(new URL(request.url).searchParams);
  return cors(Response.json(await orderReport(db, session.shop, p)));
};
