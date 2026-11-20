import { signExportLink } from "../orders/export-link.server";
import { exportFilename } from "../orders/export-rules";
import { parseListParams } from "../orders/list-rules";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?kind=2|3 plus the Orders by Brand filters: a signed, five-minute download link for that export.
// The file itself is served by /exports/line, which a plain browser tab can open.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);

  const search = new URL(request.url).searchParams;
  const kind = Number(search.get("kind"));
  if (kind !== 2 && kind !== 3) return json({ error: "bad_request" }, 400);

  const filters = new URLSearchParams(search);
  for (const key of ["kind", "page", "all"]) filters.delete(key);
  const query = filters.toString();
  const token = signExportLink({ shop: session.shop, kind, query }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/line?t=${encodeURIComponent(token)}`, filename: exportFilename(kind, parseListParams(filters).brand) });
};
