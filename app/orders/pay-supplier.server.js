// Pay To Supplier (unpaid lines) and Supplier Paid (paid lines): the legacy accountsPayToSupplierNew / accountsPayToSupplierPaid pages.
// A line is "unpaid" until staff mark it paid. Which statuses count depends on how the brand's supplier is paid (credit or pro-forma).
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };
import { lookupCosts } from "./export-query.server.js";
import { recordMinervaPayments } from "./minerva.server.js";

export const PAGE_SIZE = 50;
export const MAX_LINES = 5000;
// The legacy lists of statuses that still need paying, for brands paid on credit (also brands with no terms set) and for pro-forma brands.
export const CREDIT_STATUS_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56, 57, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 72, 74, 75, 76, 82];
export const PROFORMA_STATUS_IDS = [1, 3, 7, 8, 10, 11, 12, 15, 29, 30, 35, 36, 37, 39, 60];
const label = new Map(statuses.map((s) => [s.id, s.label]));

/** Does a line with this status still need paying for a brand paid on these terms? */
export const needsPaying = (terms, statusId) => (terms === "proforma" ? PROFORMA_STATUS_IDS : CREDIT_STATUS_IDS).includes(statusId);

/** "12.50" -> 1250, "" -> null (cleared). Anything else is refused with undefined. */
export function poundsToMinor(value) {
  const text = String(value ?? "").trim().replace(/^£/, "");
  if (text === "") return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return undefined;
  return Math.round(Number(text) * 100);
}

/**
 * What we owe the supplier for one line, as the old page did: the manual cost when there is one, else the Shopify cost times the quantity,
 * plus the DHD cost. null when neither a manual nor a Shopify cost is known. (The old supplier discount steps are not held in the app.)
 */
export function costsOf({ unitCostMinor, quantity, manualMinor, dhdMinor }) {
  const calculated = unitCostMinor == null ? null : unitCostMinor * quantity;
  const manual = manualMinor && manualMinor > 0 ? manualMinor : null;
  const base = manual ?? calculated;
  return {
    calculatedMinor: calculated,
    finalMinor: base == null ? null : base + (dhdMinor ?? 0),
    diffMinor: manual != null && calculated != null ? calculated - manual : null,
  };
}

/** Reads a POST body: op manual | dhd | invoice | paid. Returns { value } or { error }. */
export function readPayInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const lineId = typeof body.lineId === "string" && /^gid:\/\/shopify\/LineItem\/\d{1,20}$/.test(body.lineId) ? body.lineId : null;
  if (body.op === "manual" || body.op === "dhd") {
    if (!lineId) return { error: "bad_request" };
    const minor = poundsToMinor(body.value);
    return minor === undefined ? { error: "bad_amount" } : { value: { op: body.op, lineId, minor } };
  }
  if (body.op === "invoice") {
    if (!lineId) return { error: "bad_request" };
    const invoiceNumber = typeof body.value === "string" ? body.value.trim().slice(0, 100) : "";
    return { value: { op: "invoice", lineId, invoiceNumber } };
  }
  if (body.op === "paid") {
    if (typeof body.paid !== "boolean") return { error: "bad_request" };
    const lineIds = Array.isArray(body.lineIds) ? [...new Set(body.lineIds.filter((l) => typeof l === "string" && /^gid:\/\/shopify\/LineItem\/\d{1,20}$/.test(l)))].slice(0, 500) : [];
    return lineIds.length ? { value: { op: "paid", lineIds, paid: body.paid } } : { error: "nothing_selected" };
  }
  return { error: "bad_request" };
}

/** Reads ?paid=1&brand=&q=&page=&all=1. */
export function parsePayParams(searchParams) {
  const page = Number(searchParams.get("page"));
  return {
    paid: searchParams.get("paid") === "1",
    brand: (searchParams.get("brand") ?? "").trim().slice(0, 200),
    q: (searchParams.get("q") ?? "").trim().replace(/^#/, "").slice(0, 60),
    lines: (searchParams.get("lines") ?? "").split(",").filter(Boolean).slice(0, 500),
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

async function termsOf(db, shop) {
  const rows = await db.brandTerms.findMany({ where: { shop } });
  return new Map(rows.map((r) => [r.brand, r.terms]));
}

/** Shopify unit costs for these lines: { costs: Map(variantId -> { costMinor }), costLookup: "ok" | "unavailable" | "not_needed" }. A failure leaves costs blank. */
async function unitCosts(graphql, lines) {
  if (!graphql || lines.length === 0) return { costs: new Map(), costLookup: "not_needed" };
  try {
    return { costs: await lookupCosts(graphql, lines.map((l) => l.variantId)), costLookup: "ok" };
  } catch (error) {
    console.error("Pay supplier: cost lookup failed", error.message);
    return { costs: new Map(), costLookup: "unavailable" };
  }
}

export async function rowsFor(db, graphql, shop, lines, orderOf) {
  const lineIds = lines.map((l) => l.lineId);
  const [invoices, payments, { costs, costLookup }] = await Promise.all([
    lineIds.length ? db.lineSupplierInvoice.findMany({ where: { shop, lineId: { in: lineIds } } }) : [],
    lineIds.length ? db.linePayment.findMany({ where: { shop, lineId: { in: lineIds } } }) : [],
    unitCosts(graphql, lines),
  ]);
  const invoiceOf = new Map(invoices.map((i) => [i.lineId, i]));
  const paymentOf = new Map(payments.map((p) => [p.lineId, p]));
  const rows = lines.map((l) => {
    const inv = invoiceOf.get(l.lineId);
    const pay = paymentOf.get(l.lineId);
    const unitCostMinor = costs.get(l.variantId)?.costMinor ?? null;
    const c = costsOf({ unitCostMinor, quantity: l.quantity, manualMinor: pay?.manualCostMinor, dhdMinor: pay?.dhdCostMinor });
    return {
      lineId: l.lineId, orderId: l.orderId, orderName: String(orderOf.get(l.orderId)?.name ?? "").replace(/^#/, ""), orderDate: l.orderCreatedAt,
      statusId: l.lineStatusId, status: label.get(l.lineStatusId) ?? "", brand: l.vendor ?? "", title: l.title, variantTitle: l.variantTitle ?? "", code: l.sku ?? "",
      quantity: l.quantity, calculatedMinor: c.calculatedMinor, manualMinor: pay?.manualCostMinor ?? null, dhdMinor: pay?.dhdCostMinor ?? null,
      finalMinor: c.finalMinor, diffMinor: c.diffMinor, saleMinor: l.priceMinor * l.quantity - l.discountMinor,
      invoiceNumber: inv?.invoiceNumber ?? "", batchInvoiceNo: pay?.batchInvoiceNo ?? "", paidAt: pay?.paidAt ?? null, stockedDate: l.stockedDate ?? null, paid: inv?.paid === true,
    };
  });
  return { rows, costLookup };
}

/**
 * One page of the unpaid (paid=false) or paid (paid=true) lines, newest order first (paid lines: newest batch first).
 * { rows, total, page, pageCount, size, brands, pageTotalMinor, costLookup }.
 */
export async function listPayable(db, graphql, shop, params = {}) {
  const terms = await termsOf(db, shop);
  const paidInvoices = await db.lineSupplierInvoice.findMany({ where: { shop, paid: true }, select: { lineId: true } });
  const paidIds = new Set(paidInvoices.map((i) => i.lineId));

  const found = await db.orderLine.findMany({
    where: params.paid ? { shop, lineId: { in: [...paidIds] } } : { shop, quantity: { gt: 0 }, lineStatusId: { in: CREDIT_STATUS_IDS } },
    orderBy: [{ orderCreatedAt: "desc" }, { lineId: "asc" }],
    take: MAX_LINES,
  });
  const orders = found.length ? await db.order.findMany({ where: { shop, orderId: { in: [...new Set(found.map((l) => l.orderId))] } }, select: { orderId: true, name: true, cancelledAt: true } }) : [];
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const q = (params.q ?? "").toLowerCase();

  const eligible = found.filter((l) => {
    const order = orderOf.get(l.orderId);
    if (!order) return false;
    if (params.paid) return true;
    return !order.cancelledAt && !paidIds.has(l.lineId) && needsPaying(terms.get(l.vendor ?? ""), l.lineStatusId);
  });
  const brands = [...new Set(eligible.map((l) => l.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const shown = eligible.filter((l) => (!params.brand || l.vendor === params.brand) && (!q || String(orderOf.get(l.orderId).name).toLowerCase().includes(q)));

  const total = shown.length;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = params.all ? 1 : Math.min(Math.max(1, params.page ?? 1), pageCount);
  const slice = params.all ? shown : shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { rows, costLookup } = await rowsFor(db, graphql, shop, slice, orderOf);
  if (params.paid) rows.sort((a, b) => (b.batchInvoiceNo || "").localeCompare(a.batchInvoiceNo || ""));
  return { rows, total, page, pageCount, size: PAGE_SIZE, brands, pageTotalMinor: rows.reduce((s, r) => s + (r.finalMinor ?? 0), 0), costLookup };
}

/** The rows for ticked lines (paid or not) for the download. */
export async function payRowsFor(db, graphql, shop, lineIds) {
  const lines = lineIds.length ? await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds } }, orderBy: [{ orderCreatedAt: "desc" }, { lineId: "asc" }] }) : [];
  const orders = lines.length ? await db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } }, select: { orderId: true, name: true } }) : [];
  return (await rowsFor(db, graphql, shop, lines, new Map(orders.map((o) => [o.orderId, o])))).rows;
}

/** Saves a manual cost or DHD cost for a line (null clears it). { ok: true } or { ok: false, code: "no_line" }. */
export async function saveCost(db, shop, { op, lineId, minor }, actor) {
  const line = await db.orderLine.findFirst({ where: { shop, lineId } });
  if (!line) return { ok: false, code: "no_line" };
  const field = op === "manual" ? "manualCostMinor" : "dhdCostMinor";
  await db.linePayment.upsert({
    where: { shop_lineId: { shop, lineId } },
    create: { shop, orderId: line.orderId, lineId, [field]: minor, updatedByName: actor?.name ?? null },
    update: { [field]: minor, updatedByName: actor?.name ?? null },
  });
  return { ok: true };
}

/** Saves the supplier invoice number of a line, keeping its other invoice details. */
export async function saveInvoiceNumber(db, shop, { lineId, invoiceNumber }, actor) {
  const line = await db.orderLine.findFirst({ where: { shop, lineId } });
  if (!line) return { ok: false, code: "no_line" };
  await db.lineSupplierInvoice.upsert({
    where: { shop_lineId: { shop, lineId } },
    create: { shop, orderId: line.orderId, lineId, invoiceNumber: invoiceNumber || null, updatedById: actor?.id ?? null, updatedByName: actor?.name ?? null },
    update: { invoiceNumber: invoiceNumber || null, updatedById: actor?.id ?? null, updatedByName: actor?.name ?? null },
  });
  return { ok: true };
}

/** Marks lines paid (with today's date) or unpaid (date cleared). { ok: true, changed } counts the lines found. */
export async function setPaid(db, shop, lineIds, paid, actor, now = new Date()) {
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds } }, select: { lineId: true, orderId: true, vendor: true } });
  for (const l of lines) {
    await db.lineSupplierInvoice.upsert({
      where: { shop_lineId: { shop, lineId: l.lineId } },
      create: { shop, orderId: l.orderId, lineId: l.lineId, paid, updatedById: actor?.id ?? null, updatedByName: actor?.name ?? null },
      update: { paid, updatedById: actor?.id ?? null, updatedByName: actor?.name ?? null },
    });
    await db.linePayment.upsert({
      where: { shop_lineId: { shop, lineId: l.lineId } },
      create: { shop, orderId: l.orderId, lineId: l.lineId, paidAt: paid ? now : null, updatedByName: actor?.name ?? null },
      update: { paidAt: paid ? now : null, updatedByName: actor?.name ?? null },
    });
  }
  // A Minerva supplier's line is recorded for the Minerva Supplier Orders report when paid, and taken off when marked Not Paid (as the old app did on Paid).
  await recordMinervaPayments(db, shop, lines, paid, now);
  return { ok: true, changed: lines.length };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (m) => (m == null ? "" : (m / 100).toFixed(2));
const dmy = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) : "");

export const PAY_HEADERS = ["Order Date", "Order No", "Brand", "Product Details", "Product Code", "Qty", "Product Cost", "Manual Cost", "DHD Cost", "Final Cost", "Invoice No.", "Batch Invoice No.", "Payment Date", "IN Stock Date", "Order Status", "Payment Status"];

/** The old "Pay-Balance" download for the ticked lines. */
export function payCsv(rows) {
  const body = rows.map((r) =>
    [dmy(r.orderDate), r.orderName, r.brand, r.title, r.code, r.quantity, money(r.calculatedMinor), money(r.manualMinor), money(r.dhdMinor), money(r.finalMinor), r.invoiceNumber, r.batchInvoiceNo, dmy(r.paidAt), r.stockedDate ?? "", r.status, r.paid ? "Paid" : "Not Paid"].map(cell).join(","),
  );
  return `﻿${[PAY_HEADERS.join(","), ...body].join("\r\n")}\r\n`;
}
