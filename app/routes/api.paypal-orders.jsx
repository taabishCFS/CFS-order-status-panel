import db from "../db.server";
import { parsePaypalParams, paypalReport } from "../orders/paypal-orders.server";
import { authenticate } from "../shopify.server";

// GET ?from=&to=&range=&gateway=: the Paypal Orders report. Read only.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await paypalReport(db, session.shop, parsePaypalParams(new URL(request.url).searchParams))));
};
