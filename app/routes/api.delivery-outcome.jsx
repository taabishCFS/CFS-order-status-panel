import db from "../db.server";
import { listOutcome } from "../delivery/outcome.server";
import { parseOutcomeParams } from "../delivery/outcome-rules";
import { listBrands } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";

// GET ?kind=completed|failed&q=&brand=&van=&pay=&from=&to=&page=&all=1: the Completed or Failed Delivery list. Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseOutcomeParams(new URL(request.url).searchParams);
  const [list, brands] = await Promise.all([listOutcome(db, session.shop, params), listBrands(db, session.shop)]);
  return cors(Response.json({ ...list, brands }));
};
