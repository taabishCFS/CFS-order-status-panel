import db from "../db.server";
import { listPayAge, parsePayAgeParams } from "../orders/pay-age.server";
import { authenticate } from "../shopify.server";

// GET ?terms=proforma|credit&brand=&from=&to=&page=&all=1: the Proforma or Credit Payment Report, with Shopify costs. Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  return cors(Response.json(await listPayAge(db, admin.graphql, session.shop, parsePayAgeParams(new URL(request.url).searchParams))));
};
