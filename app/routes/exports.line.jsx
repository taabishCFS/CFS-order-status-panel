import db from "../db.server";
import { buildExport } from "../orders/export-query.server";
import { verifyExportLink } from "../orders/export-link.server";
import { exportFilename } from "../orders/export-rules";
import { parseListParams } from "../orders/list-rules";
import { unauthenticated } from "../shopify.server";

const refuse = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// GET ?t=<signed link>: the export file as a download. The link (made by /api/line-export for verified staff) is the proof.
export const loader = async ({ request }) => {
  const link = verifyExportLink(new URL(request.url).searchParams.get("t"), process.env.SHOPIFY_API_SECRET);
  if (!link.ok) return refuse(403, link.reason === "expired" ? "This download link has expired. Go back to the app and press the export button again." : "This download link is not valid.");
  if (link.kind !== 2 && link.kind !== 3) return refuse(400, "Unknown export.");

  const params = parseListParams(new URLSearchParams(link.query));
  const { admin } = await unauthenticated.admin(link.shop);
  const result = await buildExport({ db, graphql: admin.graphql, shop: link.shop, params, kind: link.kind });
  return new Response(result.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(link.kind, params.brand)}"`,
      "cache-control": "no-store",
    },
  });
};
