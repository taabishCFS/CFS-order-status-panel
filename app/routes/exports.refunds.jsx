import db from "../db.server";
import { verifyExportLink } from "../orders/export-link.server";
import { filteredCsv, parseRefundListParams, selectedCsv, xeroCsv } from "../orders/refund-list";
import { exportRows } from "../orders/refund-list.server";

const refuse = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// GET ?t=<signed link>: a refund list CSV as a download. The link (made by /api/refund-export for verified staff) is the proof.
export const loader = async ({ request }) => {
  const link = verifyExportLink(new URL(request.url).searchParams.get("t"), process.env.SHOPIFY_API_SECRET);
  if (!link.ok) return refuse(403, link.reason === "expired" ? "This download link has expired. Go back to the app and press the export button again." : "This download link is not valid.");

  const query = new URLSearchParams(link.query);
  let csv;
  let filename = "refund_export.csv";
  if (link.kind === "refund-selected") {
    csv = selectedCsv(await exportRows(db, link.shop, { ids: (query.get("ids") ?? "").split(",").filter(Boolean) }));
  } else if (link.kind === "refund-filtered") {
    csv = filteredCsv(await exportRows(db, link.shop, { params: parseRefundListParams(query) }));
  } else if (link.kind === "refund-xero") {
    const { from, to } = parseRefundListParams(query);
    if (!from || !to) return refuse(400, "Unknown export.");
    csv = xeroCsv(await exportRows(db, link.shop, { refundedFrom: from, refundedTo: to }));
    filename = `Refund-List_${from}_${to}.csv`;
  } else {
    return refuse(400, "Unknown export.");
  }
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
};
