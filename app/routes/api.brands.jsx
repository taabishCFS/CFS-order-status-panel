import db from "../db.server";
import { listBrands } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";

// GET: the brands (line vendors) for the brand filters.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json({ brands: await listBrands(db, session.shop) }));
};
