import db from "../db.server";
import { buildExport } from "../orders/export-query.server";
import { parseListParams } from "../orders/list-rules";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// GET ?kind=2|3 plus the Orders by Brand filters: the matching lines as a CSV, inside JSON for the extension to save.
export const loader = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);

  const url = new URL(request.url);
  const kind = Number(url.searchParams.get("kind"));
  if (kind !== 2 && kind !== 3) return json({ error: "bad_request" }, 400);

  const params = parseListParams(url.searchParams);
  const result = await buildExport({ db, graphql: admin.graphql, shop: session.shop, params, kind });
  const brand = params.brand ? `-${slug(params.brand)}` : "";
  const filename = `orders-export-${kind}${brand}-${new Date().toISOString().slice(0, 10)}.csv`;
  return json({ ...result, filename });
};
