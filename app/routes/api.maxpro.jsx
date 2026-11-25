import db from "../db.server";
import { listMaxpro } from "../delivery/maxpro.server";
import { parseMaxproParams } from "../delivery/maxpro-rules";
import { listBrands } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";

// GET ?q=&brand=&wg=1&all=1&page=: the Delivery Report CSV (Max) list, plus the brands for the filter. Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseMaxproParams(new URL(request.url).searchParams);
  const [list, brands] = await Promise.all([listMaxpro(db, session.shop, params), listBrands(db, session.shop)]);
  return cors(Response.json({ ...list, brands }));
};
