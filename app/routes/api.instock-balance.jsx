import db from "../db.server";
import { listInstockBalance, parseBalanceParams } from "../delivery/instock-balance.server";
import { authenticate } from "../shopify.server";

// GET ?page=&all=1: the Instock Balance Due list (orders that owe money while every line is in stock or on its way). Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listInstockBalance(db, session.shop, parseBalanceParams(new URL(request.url).searchParams))));
};
