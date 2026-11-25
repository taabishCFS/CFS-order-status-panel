import db from "../db.server";
import { signExportLink } from "../orders/export-link.server";
import { listBrands } from "../orders/list-query.server";
import { listChase } from "../orders/supplier-chase.server";
import { parseChaseParams } from "../orders/supplier-chase-rules";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?kind=chaseup|lapsed&brand=&from=&to=&page=: the Supplier Chaseup or Date Lapsed list, with the brands for the filter.
// GET ...&export=1: a signed, five-minute link to the CSV of the same list (served by /exports/line). Export needs a verified staff member.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  const search = new URL(request.url).searchParams;
  const params = parseChaseParams(search);

  if (search.get("export") === "1") {
    if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);
    const query = new URLSearchParams();
    for (const key of ["brand", "from", "to"]) if (params[key]) query.set(key, params[key]);
    const token = signExportLink({ shop: session.shop, kind: params.kind, query: query.toString() }, process.env.SHOPIFY_API_SECRET);
    const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
    const filename = params.kind === "lapsed" ? "date-lapsed.csv" : "supplier-chaseup.csv";
    return json({ url: `${base}/exports/line?t=${encodeURIComponent(token)}`, filename });
  }

  const [list, brands] = await Promise.all([listChase(db, session.shop, params), listBrands(db, session.shop)]);
  return json({ ...list, brands });
};
