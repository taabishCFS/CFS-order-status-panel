// Order Reports (legacy middle/reports.inc and order_reports.php, old Downloads menu): the orders placed between two dates, filtered by
// order status, with the date range's sales, three charts, a sortable page of orders with page totals, and a line-by-line CSV.
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };
import { buildCsv } from "./export-rules.js";
import { lookupCosts } from "./export-query.server.js";

export const PAGE_SIZE = 50;
export const MAX_CSV_ORDERS = 5000;
/** Order statuses left out of the sales figures and charts, as the old page: Cancelled, Deleted, Order Failed, Awaiting Payment, Awaiting V12 Approval. */
export const SALES_SKIP_STATUS_IDS = [7, 9, 32, 50, 58];
/** The line status chart keeps cancelled orders, as the old page. */
const LINE_CHART_SKIP_STATUS_IDS = [9, 32, 50, 58];
/** With no status chosen, Deleted orders are left out. */
const DEFAULT_HIDDEN = [9];
const CHART_TOP = 17;

export const STATUS_CHOICES = [...statuses].sort((a, b) => a.label.localeCompare(b.label));
const STATUS_LABEL = new Map(statuses.map((s) => [s.id, s.label]));
export const statusLabel = (id) => (id == null ? "" : STATUS_LABEL.get(id) ?? `Status ${id}`);

const SORTS = { order: "name", customer: "customerName", date: "createdAt", mode: "gateway", total: "totalMinor", status: "orderStatusId" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
export const ukToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** ?from=&to=&statuses=1,4&sort=date&dir=desc&page=1&brand=. With no dates it is today, as the old page. */
export function parseOrderReportParams(search, today = ukToday()) {
  let from = validDate(search.get("from")) ? search.get("from") : today;
  let to = validDate(search.get("to")) ? search.get("to") : today;
  if (from > to) [from, to] = [to, from];
  const ids = (search.get("statuses") ?? "").split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && STATUS_LABEL.has(n));
  const sort = Object.hasOwn(SORTS, search.get("sort") ?? "") ? search.get("sort") : "date";
  const dir = search.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(10000, Number.parseInt(search.get("page") ?? "1", 10) || 1));
  const brand = (search.get("brand") ?? "").trim().slice(0, 200);
  return { from, to, statuses: [...new Set(ids)], sort, dir, page, brand };
}

const range = (p) => ({ gte: new Date(`${p.from}T00:00:00.000Z`), lte: new Date(`${p.to}T23:59:59.999Z`) });

/** The orders on the page: in the dates, in the chosen statuses (or any but Deleted). */
export function reportWhere(shop, p) {
  const status = p.statuses.length ? { orderStatusId: { in: p.statuses } } : { OR: [{ orderStatusId: null }, { orderStatusId: { notIn: DEFAULT_HIDDEN } }] };
  return { shop, createdAt: range(p), ...status };
}

/** Orders that count as sales: in the dates (status filter ignored), not cancelled and not in a skipped status. */
export const salesWhere = (shop, p) => ({ shop, createdAt: range(p), cancelledAt: null, OR: [{ orderStatusId: null }, { orderStatusId: { notIn: SALES_SKIP_STATUS_IDS } }] });

const svc = (o, key) => Number(o.serviceMinor?.[key] ?? 0) || 0;
/** The old "Scotland." column held the Scotland charge plus the courier charge; here: Scotland, Republic of Ireland and PA/IV/KW postcodes. */
const remoteMinor = (o) => svc(o, "scotland") + svc(o, "ireland") + svc(o, "postcode_pa_iv_kw");

export function reportRow(o) {
  return {
    orderId: o.orderId, name: o.name, customer: o.customerName ?? "", createdAt: o.createdAt.toISOString(), mode: o.gateway ?? "",
    subtotalMinor: o.subtotalMinor, discountMinor: o.discountMinor, coupon: (o.discountCodes ?? []).join(", "),
    whiteGloveMinor: svc(o, "white_glove"), twoManMinor: svc(o, "two_man"), scotlandMinor: remoteMinor(o),
    totalMinor: o.totalMinor, status: o.cancelledAt ? "Cancelled" : statusLabel(o.orderStatusId), outstandingMinor: o.outstandingMinor,
  };
}

export function pageTotals(rows) {
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { subtotalMinor: sum("subtotalMinor"), discountMinor: sum("discountMinor"), whiteGloveMinor: sum("whiteGloveMinor"), twoManMinor: sum("twoManMinor"), scotlandMinor: sum("scotlandMinor"), totalMinor: sum("totalMinor") };
}

/** Top entries of a Map(label -> value), largest first. */
const top = (map, n = CHART_TOP) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([label, value]) => ({ label, value }));
const add = (map, key, n) => map.set(key, (map.get(key) ?? 0) + n);

/** The three charts of the old page, for the date range only: sales by brand, sales by payment method, order lines by status. */
export async function reportCharts(db, shop, p) {
  const orders = await db.order.findMany({ where: { shop, createdAt: range(p) }, select: { orderId: true, cancelledAt: true, orderStatusId: true, gateway: true } });
  const sales = new Set();
  const lineChart = new Set();
  const gatewayOf = new Map();
  for (const o of orders) {
    const skipped = o.orderStatusId != null && SALES_SKIP_STATUS_IDS.includes(o.orderStatusId);
    if (!o.cancelledAt && !skipped) sales.add(o.orderId);
    if (!(o.orderStatusId != null && LINE_CHART_SKIP_STATUS_IDS.includes(o.orderStatusId))) lineChart.add(o.orderId);
    gatewayOf.set(o.orderId, o.gateway?.trim() || "");
  }
  const lines = await db.orderLine.findMany({ where: { shop, orderCreatedAt: range(p) }, select: { orderId: true, vendor: true, priceMinor: true, quantity: true, discountMinor: true, lineStatusId: true } });
  const brands = new Map();
  const payments = new Map();
  const lineStatuses = new Map();
  for (const l of lines) {
    const value = l.priceMinor * l.quantity - l.discountMinor;
    if (sales.has(l.orderId)) {
      add(brands, l.vendor?.trim() || "Unmapped", value);
      const gw = gatewayOf.get(l.orderId);
      if (gw) add(payments, gw, value);
    }
    if (lineChart.has(l.orderId)) add(lineStatuses, l.lineStatusId == null ? "No status" : statusLabel(l.lineStatusId), 1);
  }
  return { brands: top(brands), payments: top(payments, 50), lineStatuses: top(lineStatuses) };
}

/** Everything the page shows. */
export async function orderReport(db, shop, p) {
  const where = reportWhere(shop, p);
  const sw = salesWhere(shop, p);
  const [count, found, salesSum, valid, charts, vendors] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: [{ [SORTS[p.sort]]: p.dir }, { createdAt: "desc" }], skip: (p.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.order.aggregate({ where: sw, _sum: { totalMinor: true } }),
    db.order.aggregate({ where: { ...sw, totalMinor: { gt: 0 } }, _count: { _all: true }, _avg: { totalMinor: true } }),
    reportCharts(db, shop, p),
    db.orderLine.findMany({ where: { shop, vendor: { not: null } }, distinct: ["vendor"], select: { vendor: true } }),
  ]);
  const rows = found.map(reportRow);
  return {
    from: p.from, to: p.to, count, page: p.page, pageSize: PAGE_SIZE, rows, pageTotals: pageTotals(rows),
    summary: { salesMinor: salesSum._sum.totalMinor ?? 0, validCount: valid._count._all, validAvgMinor: Math.round(valid._avg.totalMinor ?? 0) },
    charts,
    statuses: STATUS_CHOICES,
    brands: [...new Set(vendors.map((v) => v.vendor.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  };
}

// ---- The CSV (legacy order_reports.php): one row per product line, with the same 64 columns. ----

export const CSV_HEADERS = [
  "S.No.", "Order By", "Date & Time", "Order No", "iProductId", "Customer Name", "Customer Email", "Phone/Mobile", "Address", "Post Code", "County",
  "Brand Name", "Range Name", "Product Name", "Size", "Item Code", "Cost Price", "Regular Discount", "Prepayment Discount", "Collection Discount",
  "Supplier OfferCost", "Manual Cost", "Supplier Invoice Amount", "Supplier Invoice Date", "Supplier Invoice No", "Supplier Invoice Paid", "New Cost",
  "Qty", "Total Cost", "Selling Price", "Offer Discount %", "Offer Discount", "Voucher Name", "Voucher Discount %", "Voucher Discount", "Final Sale Price",
  "1 Man Del", "2 Man Del", "White Glove Delivery", "Scotland Delivery", "Far Off Postcodes Delivery", "Republic of Ireland Delivery", "Northern Ireland Delivery",
  "Peace of Mind", "Grand Total", "VAT(16.67%)", "Sale(Excl. VAT)", "Payment Gateway", "Order Source", "Transaction Id", "Card Net",
  "Reschedule Delivery Count", "Reschedule Delivery Charge", "Delivery Cost", "Dhd Charges", "Gross Profit", "Order Status", "Source",
  "Minerva Supplier", "Minerva Discount", "Minerva From Date", "Minerva To Date", "Order From", "Brand Group",
];

const pounds = (minor) => (minor == null ? "" : (minor / 100).toFixed(2));
const dmy = (d) => (d ? d.split("-").reverse().join("/") : "");
const dateTime = (d) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "");
const numericId = (gid) => (gid ? String(gid).split("/").pop() : "");
function address(json) {
  try {
    const a = typeof json === "string" ? JSON.parse(json) : json;
    return a ? { text: [a.address1, a.address2, a.city].filter(Boolean).join(", "), county: a.province ?? "" } : { text: "", county: "" };
  } catch {
    return { text: "", county: "" };
  }
}

/**
 * One CSV row per product line. Order-level amounts (delivery charges, Grand Total) go on the order's first line, so each column adds up to the
 * orders' totals. VAT is one sixth of the amount (20% included in the price), as the old file.
 */
export function csvRows(orders, linesByOrder, extra) {
  const out = [];
  for (const o of orders) {
    const addr = address(o.shippingAddress);
    const lines = linesByOrder.get(o.orderId) ?? [];
    lines.forEach((l, i) => {
      const first = i === 0;
      const cost = extra.costs.get(l.variantId);
      const inv = extra.invoices.get(l.lineId);
      const pay = extra.payments.get(l.lineId);
      const resch = extra.reschedules.get(l.lineId);
      const minerva = extra.minerva.get(l.vendor?.trim() ?? "");
      const finalSale = l.priceMinor * l.quantity - l.discountMinor;
      const charges = first ? o.shippingMinor + Object.values(o.serviceMinor ?? {}).reduce((s, n) => s + (Number(n) || 0), 0) : 0;
      const gross = finalSale + charges;
      const vat = Math.round(gross / 6);
      const totalCost = pay?.manualCostMinor ?? (cost?.costMinor == null ? null : cost.costMinor * l.quantity);
      const dhd = pay?.dhdCostMinor ?? null;
      const orderLevel = (minor) => (first ? pounds(minor) : "");
      out.push([
        out.length + 1, o.orderTakenBy ?? "", dateTime(o.createdAt), o.name.replace(/^#/, ""), numericId(l.productId), o.customerName ?? "", o.email ?? "", o.phone ?? "",
        addr.text, o.postcode ?? "", addr.county, l.vendor ?? "", cost?.range ?? "", l.title, l.variantTitle ?? "", l.sku ?? "", pounds(cost?.costMinor ?? null), "", "", "",
        "", pounds(pay?.manualCostMinor ?? null), pounds(inv?.amountMinor ?? null), dmy(inv?.invoiceDate), inv?.invoiceNumber ?? "", inv ? (inv.paid ? "Yes" : "No") : "", "",
        l.quantity, pounds(totalCost), pounds(l.priceMinor), "", pounds(l.discountMinor), (o.discountCodes ?? []).join(" "), "", "", pounds(finalSale),
        orderLevel(o.shippingMinor), orderLevel(svc(o, "two_man")), orderLevel(svc(o, "white_glove")), orderLevel(svc(o, "scotland")), orderLevel(svc(o, "postcode_pa_iv_kw")), orderLevel(svc(o, "ireland")), "",
        orderLevel(svc(o, "peace_of_mind")), pounds(gross), pounds(vat), pounds(gross - vat), o.gateway ?? "", o.orderSource ?? "", "", "",
        resch?.count ?? "", pounds(resch?.chargeMinor ?? null), "", pounds(dhd), totalCost == null ? "" : pounds(gross - vat - totalCost - (dhd ?? 0)), statusLabel(l.lineStatusId), o.site ?? "",
        minerva ? "Yes" : "", minerva ? String(minerva.discHundredths / 100) : "", dmy(minerva?.fromDate), dmy(minerva?.toDate), o.sourceName ?? "", "",
      ]);
    });
  }
  return out;
}

export const csvFileName = (p) => `order_report_${p.brand || "All brands"}-${p.from} to ${p.to}.csv`.replace(/[\\/:*?"<>|]/g, "-");

/** { csv, count, capped }. Every order on the page's filters (all pages), newest first; only the chosen brand's lines when one is chosen. */
export async function orderReportCsv(db, graphql, shop, p) {
  const found = await db.order.findMany({ where: reportWhere(shop, p), orderBy: { createdAt: "desc" }, take: MAX_CSV_ORDERS + 1 });
  const capped = found.length > MAX_CSV_ORDERS;
  const orders = capped ? found.slice(0, MAX_CSV_ORDERS) : found;
  const ids = orders.map((o) => o.orderId);
  const lines = ids.length ? await db.orderLine.findMany({ where: { shop, orderId: { in: ids }, ...(p.brand ? { vendor: p.brand } : {}) }, orderBy: { id: "asc" } }) : [];
  const lineIds = lines.map((l) => l.lineId);
  const [invoices, payments, reschedules, minerva, costs] = await Promise.all([
    lineIds.length ? db.lineSupplierInvoice.findMany({ where: { shop, lineId: { in: lineIds } } }) : [],
    lineIds.length ? db.linePayment.findMany({ where: { shop, lineId: { in: lineIds } } }) : [],
    lineIds.length ? db.lineReschedule.findMany({ where: { shop, lineId: { in: lineIds } } }) : [],
    db.minervaBrand.findMany({ where: { shop } }),
    costsFor(graphql, lines),
  ]);
  const byLine = (rows) => new Map(rows.map((r) => [r.lineId, r]));
  const linesByOrder = new Map();
  for (const l of lines) linesByOrder.set(l.orderId, [...(linesByOrder.get(l.orderId) ?? []), l]);
  const rows = csvRows(orders.filter((o) => linesByOrder.has(o.orderId)), linesByOrder, {
    costs, invoices: byLine(invoices), payments: byLine(payments), reschedules: byLine(reschedules), minerva: new Map(minerva.map((m) => [m.brand.trim(), m])),
  });
  return { csv: buildCsv(CSV_HEADERS, rows), count: rows.length, capped };
}

async function costsFor(graphql, lines) {
  if (!graphql || lines.length === 0) return new Map();
  try {
    return await lookupCosts(graphql, lines.map((l) => l.variantId));
  } catch (error) {
    console.error("Order report: cost lookup failed", error.message);
    return new Map();
  }
}
