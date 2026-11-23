import { signExportLink } from "../orders/export-link.server";
import { parseRefundListParams } from "../orders/refund-list";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?kind=selected&ids=a,b | ?kind=filtered plus the list's filters | ?kind=xero&from=&to=: a signed, five-minute download link.
// The file itself is served by /exports/refunds, which a plain browser tab can open.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);

  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  let query;
  let filename = "refund_export.csv";
  if (kind === "selected") {
    const ids = (search.get("ids") ?? "").split(",").filter(Boolean);
    if (ids.length < 1 || ids.length > 500) return json({ error: "bad_request" }, 400);
    query = new URLSearchParams({ ids: ids.join(",") }).toString();
  } else if (kind === "filtered") {
    const filters = new URLSearchParams(search);
    for (const key of ["kind", "page", "all"]) filters.delete(key);
    query = filters.toString();
  } else if (kind === "xero") {
    const { from, to } = parseRefundListParams(search);
    if (!from || !to) return json({ error: "bad_request" }, 400);
    query = new URLSearchParams({ from, to }).toString();
    filename = `Refund-List_${from}_${to}.csv`;
  } else {
    return json({ error: "bad_request" }, 400);
  }

  const token = signExportLink({ shop: session.shop, kind: `refund-${kind}`, query }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/refunds?t=${encodeURIComponent(token)}`, filename });
};
