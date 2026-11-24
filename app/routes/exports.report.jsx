import db from "../db.server";
import { verifyExportLink } from "../orders/export-link.server";
import { buildReport } from "../orders/report-query.server";
import { REPORTS, STOCK_REPORTS, parseReportParams, reportFilename } from "../orders/report-rules";
import { unauthenticated } from "../shopify.server";

const refuse = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// GET ?t=<signed link>: a report CSV as a download. The link (made by /api/report-link for verified staff) is the proof.
export const loader = async ({ request }) => {
  const link = verifyExportLink(new URL(request.url).searchParams.get("t"), process.env.SHOPIFY_API_SECRET);
  if (!link.ok) return refuse(403, link.reason === "expired" ? "This download link has expired. Go back to the app and press the report button again." : "This download link is not valid.");

  const kind = typeof link.kind === "string" && link.kind.startsWith("report-") ? link.kind.slice("report-".length) : "";
  if (!Object.hasOwn(REPORTS, kind)) return refuse(400, "Unknown report.");
  const query = new URLSearchParams(link.query);
  const params = parseReportParams(kind, (name) => query.get(name));
  if (!params) return refuse(400, "Unknown report.");

  const graphql = kind === "outstanding" || Object.hasOwn(STOCK_REPORTS, kind) ? (await unauthenticated.admin(link.shop)).admin.graphql : undefined;
  const result = await buildReport({ db, graphql, shop: link.shop, kind, range: params.range, terms: params.terms });
  return new Response(result.csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${reportFilename(kind, params.range, params.terms)}"`, "cache-control": "no-store" },
  });
};
