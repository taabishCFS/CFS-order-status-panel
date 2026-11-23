import { signExportLink } from "../orders/export-link.server";
import { REPORTS, parseReportParams, reportFilename, reportQuery } from "../orders/report-rules";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?kind=xero|outstanding&from=YYYY-MM-DD&to=YYYY-MM-DD (outstanding also &terms=credit|proforma) or ?kind=delivery:
// a signed, five-minute download link for that report. The file itself is served by /exports/report, which a plain browser tab can open.
// Verified staff only.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);

  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  if (!Object.hasOwn(REPORTS, kind)) return json({ error: "bad_request" }, 400);

  const params = parseReportParams(kind, (name) => search.get(name));
  if (!params) return json({ error: REPORTS[kind].needsTerms && search.get("terms") !== "credit" && search.get("terms") !== "proforma" ? "bad_terms" : "bad_dates" }, 400);

  const token = signExportLink({ shop: session.shop, kind: `report-${kind}`, query: reportQuery(params) }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/report?t=${encodeURIComponent(token)}`, filename: reportFilename(kind, params.range, params.terms) });
};
