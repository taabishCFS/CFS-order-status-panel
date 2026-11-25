import db from "../db.server";
import { parseBookedParams } from "../delivery/booked-delivery-rules";
import { listBooked, onlyLines } from "../delivery/booked-delivery.server";
import { bookedCsv, bookedFileName, driverSheetCsv, pickListCsv, sheetFileName } from "../delivery/delivery-csv";
import { verifyExportLink } from "../orders/export-link.server";

const refuse = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const file = (csv, filename) =>
  new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`, "cache-control": "no-store" } });

// GET ?t=<signed link>: a Delivery Booked CSV, or one run's Pick List or Driver Sheet. The link (made by /api/delivery-export) is the proof.
export const loader = async ({ request }) => {
  const link = verifyExportLink(new URL(request.url).searchParams.get("t"), process.env.SHOPIFY_API_SECRET);
  if (!link.ok) return refuse(403, link.reason === "expired" ? "This download link has expired. Go back to the app and press the export button again." : "This download link is not valid.");

  const query = new URLSearchParams(link.query);
  if (link.kind === "delivery-booked") {
    const p = parseBookedParams(query, query.get("from") ?? "");
    let { runs } = await listBooked(db, link.shop, p);
    const lines = (query.get("lines") ?? "").split(",").filter(Boolean);
    if (lines.length) runs = onlyLines(runs, lines);
    if (runs.length === 0) return refuse(404, "Nothing to export.");
    return file(bookedCsv(runs), bookedFileName(runs, p.from, p.to));
  }
  if (link.kind === "delivery-picklist" || link.kind === "delivery-driversheet") {
    const date = query.get("date");
    const { runs } = await listBooked(db, link.shop, { from: date, to: date, brand: null, q: "" });
    const run = runs.find((r) => r.vanId === query.get("van"));
    if (!run) return refuse(404, "Nothing to export.");
    return link.kind === "delivery-picklist" ? file(pickListCsv(run), sheetFileName(run, "picklist")) : file(driverSheetCsv(run), sheetFileName(run, "driversheet"));
  }
  return refuse(400, "Unknown export.");
};
