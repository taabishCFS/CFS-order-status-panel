import db from "../db.server";
import { listLines } from "../orders/list-query.server";
import { parseListParams } from "../orders/list-rules";
import { lookupStock } from "../orders/stock-lookup.server";
import { withStock } from "../orders/stock-rules";
import { authenticate } from "../shopify.server";

// GET: the Orders by Brand line list with its summary. Each row also carries its out-of-stock tint, read live from Shopify;
// if Shopify cannot be read the list is still returned, untinted, and stockLookup says "unavailable".
export const loader = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const params = parseListParams(new URL(request.url).searchParams);
  const list = await listLines(db, session.shop, params);

  let stock = null;
  let stockLookup = "ok";
  try {
    stock = await lookupStock(admin.graphql, list.rows.map((r) => r.variantId));
  } catch (error) {
    console.error("Line list: stock lookup failed", error?.message ?? error);
    stockLookup = "unavailable";
  }
  return cors(Response.json({ ...list, rows: withStock(list.rows, stock), stockLookup }));
};
