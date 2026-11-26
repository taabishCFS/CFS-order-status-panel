import db from "../db.server";
import { listCarrier } from "../delivery/carrier.server";
import { parseCarrierParams } from "../delivery/carrier-rules";
import { listBrands } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";

// GET ?key=tnt|pallet|furdeco|dhd|white-glove|allocated&q=&brand=&van=&from=&to=&page=&all=1: a Carrier Deliveries list. Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseCarrierParams(new URL(request.url).searchParams);
  const [list, brands] = await Promise.all([listCarrier(db, session.shop, params), listBrands(db, session.shop)]);
  return cors(Response.json({ ...list, brands }));
};
