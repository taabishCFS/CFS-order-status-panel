import db from "../db.server";
import { parseBookedParams } from "../delivery/booked-delivery-rules";
import { listBooked, onlyLines } from "../delivery/booked-delivery.server";
import { carrierRows } from "../delivery/carrier.server";
import { CARRIERS, carrierCsv, carrierPrintHtml, parseCarrierParams } from "../delivery/carrier-rules";
import { outcomeRows } from "../delivery/outcome.server";
import { KINDS, outcomeCsv, parseOutcomeParams } from "../delivery/outcome-rules";
import { balanceRowsFor, instockBalanceCsv } from "../delivery/instock-balance.server";
import { balancePendingAllCsv, balancePendingCsv, balancePendingFileName, balancePendingRowsFor, parseBalancePendingParams } from "../orders/balance-pending.server";
import { maxproRowsFor } from "../delivery/maxpro.server";
import { feedbackCsv, parseFeedbackParams } from "../orders/feedback-calling.server";
import { orderWiseCsv, productWiseCsv } from "../delivery/maxpro-rules";
import { bookedCsv, bookedFileName, driverSheetCsv, pickListCsv, sheetFileName } from "../delivery/delivery-csv";
import { payCsv, payRowsFor } from "../orders/pay-supplier.server";
import { PAY_AGE, listPayAge, parsePayAgeParams, payAgeCsv } from "../orders/pay-age.server";
import { listReschedules, parseRescheduleParams, rescheduleCsv } from "../orders/reschedule-orders.server";
import { minervaCsv, minervaReport, parseMinervaParams } from "../orders/minerva.server";
import { csvFileName, orderReportCsv, parseOrderReportParams } from "../orders/order-reports.server";
import { marketingCsv, marketingFileName, parseMarketingParams } from "../orders/marketing-sales.server";
import { unauthenticated } from "../shopify.server";
import { verifyExportLink } from "../orders/export-link.server";

const refuse = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const file = (csv, filename) =>
  new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`, "cache-control": "no-store" } });

// GET ?t=<signed link>: a Delivery Booked CSV, one run's Pick List or Driver Sheet, or a Maxpro file. The link (made by /api/delivery-export) is the proof.
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
  if (link.kind === "delivery-pay-supplier") {
    const lines = (query.get("lines") ?? "").split(",").filter((x) => /^gid:\/\/shopify\/LineItem\/\d{1,20}$/.test(x));
    const graphql = (await unauthenticated.admin(link.shop)).admin.graphql;
    const rows = await payRowsFor(db, graphql, link.shop, lines);
    if (rows.length === 0) return refuse(404, "Nothing to export.");
    const stamp = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false }).replace(/[/:, ]+/g, "-");
    return file(payCsv(rows), `Pay-Balance${stamp}.csv`);
  }
  if (link.kind === "delivery-pay-age") {
    const p = parsePayAgeParams(query);
    if (p.lines.length === 0) return refuse(404, "Nothing to export.");
    const graphql = (await unauthenticated.admin(link.shop)).admin.graphql;
    const { rows } = await listPayAge(db, graphql, link.shop, { ...p, all: true });
    if (rows.length === 0) return refuse(404, "Nothing to export. The items may have changed since the list was loaded.");
    return file(payAgeCsv(rows), PAY_AGE[p.terms].file);
  }
  if (link.kind === "delivery-reschedule-orders") {
    const p = parseRescheduleParams(query);
    if (p.lines.length === 0) return refuse(404, "Nothing to export.");
    const { rows } = await listReschedules(db, link.shop, { ...p, all: true });
    if (rows.length === 0) return refuse(404, "Nothing to export.");
    return file(rescheduleCsv(rows), "rescheduleDeliveryOrder.csv");
  }
  if (link.kind === "delivery-marketing-sales") {
    const read = parseMarketingParams(query);
    if (read.error) return refuse(400, read.error);
    const graphql = (await unauthenticated.admin(link.shop)).admin.graphql;
    const out = await marketingCsv(db, graphql, link.shop, read.value);
    if (out.error) return refuse(400, out.error);
    if (out.count === 0) return refuse(404, "Nothing to export.");
    return file(out.csv, marketingFileName(read.value));
  }
  if (link.kind === "delivery-order-report") {
    const p = parseOrderReportParams(query);
    const graphql = (await unauthenticated.admin(link.shop)).admin.graphql;
    const { csv, count } = await orderReportCsv(db, graphql, link.shop, p);
    if (count === 0) return refuse(404, "Nothing to export.");
    return file(csv, csvFileName(p));
  }
  if (link.kind === "delivery-minerva") {
    const { rows } = await minervaReport(db, link.shop, parseMinervaParams(query));
    if (rows.length === 0) return refuse(404, "Nothing to export.");
    return file(minervaCsv(rows), "minerva_report.csv");
  }
  if (link.kind === "delivery-instock-balance") {
    const ids = (query.get("ids") ?? "").split(",").filter((x) => /^\d{1,20}$/.test(x));
    const rows = await balanceRowsFor(db, link.shop, ids);
    if (rows.length === 0) return refuse(404, "Nothing to export. The orders may have been paid or changed since the list was loaded.");
    return file(instockBalanceCsv(rows), "Instock-Pending-Balance.csv");
  }
  if (link.kind === "delivery-balance-pending") {
    const ids = (query.get("ids") ?? "").split(",").filter((x) => /^\d{1,20}$/.test(x));
    const rows = await balancePendingRowsFor(db, link.shop, ids);
    if (rows.length === 0) return refuse(404, "Nothing to export. The orders may have been paid or changed since the list was loaded.");
    return file(balancePendingCsv(rows), balancePendingFileName(parseBalancePendingParams(query).status));
  }
  if (link.kind === "delivery-balance-pending-all") {
    const graphql = (await unauthenticated.admin(link.shop)).admin.graphql;
    const out = await balancePendingAllCsv(db, graphql, link.shop);
    if (out.count === 0) return refuse(404, "Nothing to export: the orders that owe money have no items to list (Completed, Cancelled, Deleted, Order Failed, Payment Not Confirmed, Awaiting V12 Approval and Awaiting Payment items are left out).");
    return file(out.csv, out.fileName);
  }
  if (link.kind === "delivery-feedback-calling") {
    const p = parseFeedbackParams(query);
    const out = await feedbackCsv(db, link.shop, p);
    if (out.count === 0) return refuse(404, "Nothing to export: no completed orders match these dates and filters.");
    return file(out.csv, out.fileName);
  }
  if (link.kind === "delivery-maxpro-order" || link.kind === "delivery-maxpro-product") {
    const ids = (query.get("ids") ?? "").split(",").filter((x) => /^\d{1,20}$/.test(x)).map((x) => `gid://shopify/Order/${x}`);
    const rows = await maxproRowsFor(db, link.shop, ids);
    if (rows.length === 0) return refuse(404, "Nothing to export. The orders may have been booked or changed since the list was loaded.");
    return link.kind === "delivery-maxpro-order" ? file(orderWiseCsv(rows), "MaxPro_Orderwise.csv") : file(productWiseCsv(rows), "MaxPro_Productwise.csv");
  }
  if (link.kind === "delivery-carrier-print") {
    const params = { ...parseCarrierParams(query), all: true };
    const rows = await carrierRows(db, link.shop, params);
    if (rows.length === 0) return refuse(404, "Nothing to export.");
    const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    return new Response(carrierPrintHtml(CARRIERS[params.key].title.replace(/[^A-Za-z0-9]+/g, "_"), rows, stamp), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (link.kind === "delivery-carrier") {
    const params = { ...parseCarrierParams(query), all: true };
    const rows = await carrierRows(db, link.shop, params);
    if (rows.length === 0) return refuse(404, "Nothing to export.");
    return file(carrierCsv(rows, params.key), CARRIERS[params.key].file);
  }
  if (link.kind === "delivery-outcome-completed" || link.kind === "delivery-outcome-failed") {
    const params = { ...parseOutcomeParams(query), all: true };
    const rows = await outcomeRows(db, link.shop, params);
    if (rows.length === 0) return refuse(404, "Nothing to export.");
    return file(outcomeCsv(params.kind, rows), KINDS[params.kind].file);
  }
  return refuse(400, "Unknown export.");
};
