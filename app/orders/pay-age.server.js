// Proforma Payment Report and Credit Payment Report (legacy payAgeByProforma / payAgeByCredit): the lines of pro-forma brands waiting to be
// paid before the supplier sends (status 3 or 12), and of credit brands now in stock (status 4), with the invoice amount and the amount with VAT.
import { PAGE_SIZE, rowsFor } from "./pay-supplier.server.js";

export const PAY_AGE = {
  proforma: { title: "Proforma Payment Report", statuses: [3, 12], file: "proforma_payment_report.csv" },
  credit: { title: "Credit Payment Report", statuses: [4], file: "credit_payment_report.csv" },
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads ?terms=proforma|credit&brand=&from=&to=&page=&all=1&lines=. */
export function parsePayAgeParams(searchParams) {
  const page = Number(searchParams.get("page"));
  let from = DATE.test(searchParams.get("from") ?? "") ? searchParams.get("from") : "";
  let to = DATE.test(searchParams.get("to") ?? "") ? searchParams.get("to") : "";
  if (from && to && from > to) [from, to] = [to, from];
  return {
    terms: searchParams.get("terms") === "credit" ? "credit" : "proforma",
    brand: (searchParams.get("brand") ?? "").trim().slice(0, 200),
    from, to,
    lines: (searchParams.get("lines") ?? "").split(",").filter((l) => /^gid:\/\/shopify\/LineItem\/\d{1,20}$/.test(l)).slice(0, 500),
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** The invoice amount: the manual cost when one is set, else the Shopify cost times the quantity. With VAT adds 20%. */
export const invoiceAmounts = (row) => {
  const amount = row.manualMinor && row.manualMinor > 0 ? row.manualMinor : row.calculatedMinor;
  return { invoiceMinor: amount ?? null, invoiceVatMinor: amount == null ? null : Math.round(amount * 1.2) };
};

async function matchingLines(db, shop, params) {
  const cfg = PAY_AGE[params.terms];
  const brands = (await db.brandTerms.findMany({ where: { shop, terms: params.terms } })).map((b) => b.brand);
  if (brands.length === 0) return { lines: [], brands: [] };
  const created = {};
  if (params.from) created.gte = new Date(`${params.from}T00:00:00Z`);
  if (params.to) created.lte = new Date(`${params.to}T23:59:59.999Z`);
  const where = { shop, quantity: { gt: 0 }, lineStatusId: { in: cfg.statuses }, vendor: { in: params.brand ? brands.filter((b) => b === params.brand) : brands } };
  if (created.gte || created.lte) where.orderCreatedAt = created;
  const lines = await db.orderLine.findMany({ where, orderBy: [{ orderCreatedAt: "desc" }, { lineId: "asc" }], take: 5000 });
  return { lines, brands: brands.sort((a, b) => a.localeCompare(b)) };
}

/** { rows, total, page, pageCount, size, brands, brandTermsSet, costLookup }. Rows carry invoiceMinor and invoiceVatMinor. */
export async function listPayAge(db, graphql, shop, params) {
  const { lines: all, brands } = await matchingLines(db, shop, params);
  const orders = all.length ? await db.order.findMany({ where: { shop, orderId: { in: [...new Set(all.map((l) => l.orderId))] } }, select: { orderId: true, name: true, cancelledAt: true } }) : [];
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const lines = all.filter((l) => orderOf.has(l.orderId) && !orderOf.get(l.orderId).cancelledAt && (!params.lines?.length || params.lines.includes(l.lineId)));
  const total = lines.length;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = params.all ? 1 : Math.min(Math.max(1, params.page ?? 1), pageCount);
  const slice = params.all ? lines : lines.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { rows, costLookup } = await rowsFor(db, graphql, shop, slice, orderOf);
  return { rows: rows.map((r) => ({ ...r, ...invoiceAmounts(r) })), total, page, pageCount, size: PAGE_SIZE, brands, brandTermsSet: brands.length > 0, costLookup };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (m) => (m == null ? "" : (m / 100).toFixed(2));
const dmy = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) : "");

/** The download: the page's columns for the ticked lines. */
export function payAgeCsv(rows) {
  const head = "Order Date,Order No,Brand,Item,Product Code,Qty.,Invoice Amt.,Invoice+VAT Amt.,Status";
  const body = rows.map((r) => [dmy(r.orderDate), r.orderName, r.brand, r.title, r.code, r.quantity, money(r.invoiceMinor), money(r.invoiceVatMinor), r.status].map(cell).join(","));
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}
