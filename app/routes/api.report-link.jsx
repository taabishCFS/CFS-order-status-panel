import { signExportLink } from "../orders/export-link.server";
import { REPORTS, parseReportRange, reportFilename } from "../orders/report-rules";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?kind=xero&from=YYYY-MM-DD&to=YYYY-MM-DD or ?kind=delivery: a signed, five-minute download link for that report.
// The file itself is served by /exports/report, which a plain browser tab can open. Verified staff only.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);

  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  if (!Object.hasOwn(REPORTS, kind)) return json({ error: "bad_request" }, 400);

  let range;
  let query = "";
  if (REPORTS[kind].needsDates) {
    range = parseReportRange(search.get("from"), search.get("to"));
    if (!range) return json({ error: "bad_dates" }, 400);
    query = new URLSearchParams({ from: range.from, to: range.to }).toString();
  }
  const token = signExportLink({ shop: session.shop, kind: `report-${kind}`, query }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/report?t=${encodeURIComponent(token)}`, filename: reportFilename(kind, range) });
};
