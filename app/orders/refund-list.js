// Pure rules for the accounts refund list (legacy Refund Orders List): reading the filters, the database filter and sort,
// the paid amount, and the three CSV files. No database access here.
import REASONS from "../../extensions/cfs-orders-dashboard/src/refundReasons.json";
import { buildCsv } from "./export-rules.js";

export const PAGE_SIZE = 50;
export const MAX_ALL = 2000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v) => (v && DATE.test(v) && new Date(`${v}T00:00:00.000Z`).toISOString().startsWith(v) ? v : null);
const SORTS = { added: "createdAt", order: "orderName", reason: "reason", notes: "notes", amount: "amountMinor", refunded: "refundedAt" };
const CLAIMABLE_REASONS = new Set(["DamagedFullRefund", "DamagedFullRefundFreeStock", "DamagedPartRefund", "ManufacturingDefectFullRefund", "ManufacturingDefectPartRefund"]);

export function parseRefundListParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const view = searchParams.get("view");
  const sort = searchParams.get("sort");
  return {
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    all: searchParams.get("all") === "1",
    from: realDate(searchParams.get("from")),
    to: realDate(searchParams.get("to")),
    q: (searchParams.get("q") ?? "").trim().slice(0, 40),
    view: view === "pending" || view === "refunded" ? view : null,
    sort: Object.hasOwn(SORTS, sort ?? "") ? sort : null,
    dir: searchParams.get("dir") === "asc" ? "asc" : "desc",
  };
}

/** Legacy: pending is the default, but searching for an order number shows its requests in every state. */
export const viewOf = (p) => p.view ?? (p.q ? "all" : "pending");

export function buildRefundWhere(shop, p) {
  const view = viewOf(p);
  const and = [{ status: view === "pending" ? "requested" : view === "refunded" ? "done" : { in: ["requested", "done"] } }];
  const q = p.q.replace(/^#/, "");
  if (q) and.push({ orderName: { in: [`#${q}`, q] } });
  if (p.from || p.to) and.push({ createdAt: { ...(p.from ? { gte: new Date(`${p.from}T00:00:00.000Z`) } : {}), ...(p.to ? { lte: new Date(`${p.to}T23:59:59.999Z`) } : {}) } });
  return { shop, AND: and };
}

export function refundOrderBy(p) {
  if (p.sort) return [{ [SORTS[p.sort]]: p.dir }, { id: "desc" }];
  if (viewOf(p) === "refunded") return [{ refundedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

/** Legacy: the paid amount when the order is part paid, otherwise the order total. */
export const paidMinor = (order) => (order.outstandingMinor > 0 ? order.totalMinor - order.outstandingMinor : order.totalMinor);

/** The Claimable? choice only applies to damaged and manufacturing-defect refunds. */
export const claimableApplies = (reason) => CLAIMABLE_REASONS.has(reason);

const pounds = (minor) => (minor / 100).toFixed(2);
const day = (d) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "");
const stamp = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
const plain = (name) => String(name ?? "").replace(/^#/, "");
const claim = (c) => (c === "claimable" ? "Claimable" : c === "non_claimable" ? "Non Claimable" : "");

const sharedCells = (r) => [stamp(r.createdAt), r.payMode, pounds(r.amountMinor), r.type === "part" ? "Part Payment" : "Full Payment", r.reason, r.notes, r.refunded, day(r.refundedAt), r.operator, claim(r.claimable), r.brands.join(", ")];

/** Legacy "refunded" export: the ticked rows. */
export function selectedCsv(rows) {
  const headers = ["Order Date", "Added Date", "Order Number", "Pay Mode", "Refund Amount", "Payment Type", "Refund Reason", "Refund Notes", "Refunded?", "Refund Date", "Operator", "Claimable Amt", "Brands"];
  return buildCsv(headers, rows.map((r) => { const [added, ...rest] = sharedCells(r); return [day(r.orderCreatedAt), added, plain(r.orderName), ...rest]; }));
}

/** Legacy "refundedAllDownload" export: everything the current filters show. */
export function filteredCsv(rows) {
  const headers = ["Order Number", "Added Date", "Pay Mode", "Refund Amount", "Payment Type", "Refund Reason", "Refund Notes", "Refunded?", "Refund Date", "Operator", "Claimable Amt", "Brands"];
  return buildCsv(headers, rows.map((r) => { const [added, ...rest] = sharedCells(r); return [plain(r.orderName), added, ...rest]; }));
}

/** Legacy "Export Refund By Date": one negative credit-note line per refund, for Xero. */
export function xeroCsv(rows) {
  const headers = ["ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity", "PORegion", "POPostalCode", "POCountry", "InvoiceNumber", "Reference", "InvoiceDate", "DueDate", "Total", "InventoryItemCode", "Description", "Quantity", "UnitAmount", "Discount", "AccountCode", "TaxType", "TaxAmount", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2", "Currency", "BrandingTheme"];
  return buildCsv(headers, rows.map((r) => {
    const b = r.billing ?? {};
    return [b.name ?? "", (r.email ?? "").toLowerCase(), b.address1 ?? "", b.address2 ?? "", "", "", b.city ?? "", b.province ?? "", b.zip ?? "", b.countryCodeV2 ?? "", `${plain(r.orderName)}R`, "", day(r.refundedAt), day(r.refundedAt), "", "", r.notes, 1, `-${pounds(r.amountMinor)}`, "", 200, "20% (VAT on Income)", "", "", "", "", "", "", ""];
  }));
}

const REASON_CODES = new Set(REASONS.map((r) => r.code));
const bad = (error) => ({ error });
const text = (v) => (typeof v === "string" ? v.trim() : "");

/** Reads the Add Order form. Returns { value } (amountMinor in pence) or { error }. */
export function readManualInput(body) {
  if (!body || typeof body !== "object") return bad("bad_request");
  const { clientKey, reason, type, amount, notes, transactionId } = body;
  if (typeof clientKey !== "string" || clientKey.length < 1 || clientKey.length > 80) return bad("bad_request");
  if (!REASON_CODES.has(reason)) return bad("bad_reason");
  if (type !== "part" && type !== "full") return bad("bad_type");
  const orderName = text(body.orderName).replace(/^#/, "");
  if (!orderName || orderName.length > 20) return bad("bad_order");
  const cleaned = (typeof amount === "string" || typeof amount === "number" ? String(amount) : "").replace(/[£,\s]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) <= 0) return bad("bad_amount");
  const note = text(notes);
  if (!note || note.length > 1000) return bad("bad_notes");
  const txn = text(transactionId);
  if (txn.length > 80) return bad("bad_transaction_id");
  return { value: { clientKey, orderName, reason, type, amountMinor: Math.round(Number(cleaned) * 100), notes: note, transactionId: txn } };
}

const ID = (v) => typeof v === "string" && v.length >= 1 && v.length <= 40;

/** Reads a POST to the list: markRefunded { id, transactionId }, claimable { id, value }, remove { ids }. */
export function readRefundAction(body) {
  if (!body || typeof body !== "object") return bad("bad_request");
  if (body.action === "markRefunded" && ID(body.id) && typeof body.transactionId === "string") return { value: { action: "markRefunded", id: body.id, transactionId: body.transactionId } };
  if (body.action === "claimable" && ID(body.id) && typeof body.value === "string") return { value: { action: "claimable", id: body.id, value: body.value } };
  if (body.action === "remove" && Array.isArray(body.ids) && body.ids.length >= 1 && body.ids.length <= 500 && body.ids.every(ID)) return { value: { action: "remove", ids: [...new Set(body.ids)] } };
  return bad("bad_request");
}
