// Balance Pending (legacy "balance_pending" + balance_pending_add.php): every order that still owes money.
// The list, the "export ticked" order file and the "Download All" line file.
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };
import { lookupCosts } from "./export-query.server.js";

export const PAGE_SIZE = 50;
// Orders are listed while at least one line is NOT Order Failed, Deleted, Cancelled, Completed, Awaiting V12 Approval or Awaiting Payment.
export const LIST_HIDDEN = [32, 9, 7, 6, 58, 50];
// Download All leaves out lines in those statuses, and Payment Not Confirmed too (as the old file did).
export const DOWNLOAD_HIDDEN = [6, 7, 9, 32, 56, 58, 50];
// The lines that share the paid and owed amounts in Download All (the old file's "live" statuses).
export const SHARE_STATUSES = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 16, 19, 35, 36, 38, 40, 41, 42, 43, 51, 53, 57, 59];
// "Full refund" when every line is Order Failed, Cancelled or Awaiting Payment (the old page's rule).
const REFUND_ALL = [32, 7, 50];

const label = new Map(statuses.map((s) => [s.id, s.label]));
export const statusLabel = (id) => (id == null ? "" : label.get(id) ?? "");

/** Reads ?page=&all=1&status=&q=. status 0 or missing means every status. */
export function parseBalancePendingParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const status = Number(searchParams.get("status"));
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  return {
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    status: Number.isInteger(status) && label.has(status) ? status : 0,
    q,
  };
}

/** Is the order on the list? A line with no status counts as a live line. */
export const isListed = (lineStatuses, status = 0) =>
  status ? lineStatuses.includes(status) : lineStatuses.length === 0 || lineStatuses.some((s) => s == null || !LIST_HIDDEN.includes(s));

/** "full" | "part" | null: the refund mark next to the amounts. */
export function refundMark(order, lineStatuses) {
  const set = lineStatuses.filter((s) => s != null);
  if (set.length > 0 && set.length === lineStatuses.length && set.every((s) => REFUND_ALL.includes(s))) return "full";
  return order.refundedMinor > 0 ? "part" : null;
}

const matches = (o, q) => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [o.name, o.email, o.customerName, o.gateway].some((v) => (v ?? "").toLowerCase().includes(needle));
};

async function owingOrders(db, shop) {
  const orders = await db.order.findMany({
    where: { shop, cancelledAt: null, outstandingMinor: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, name: true, createdAt: true, customerName: true, email: true, postcode: true, gateway: true, totalMinor: true, outstandingMinor: true, refundedMinor: true },
  });
  const lines = orders.length
    ? await db.orderLine.findMany({ where: { shop, orderId: { in: orders.map((o) => o.orderId) } }, orderBy: { id: "asc" } })
    : [];
  const byOrder = new Map();
  for (const l of lines) {
    if (!byOrder.has(l.orderId)) byOrder.set(l.orderId, []);
    byOrder.get(l.orderId).push(l);
  }
  return { orders, byOrder };
}

const toRow = (o, lines) => {
  const lineStatuses = lines.map((l) => l.lineStatusId ?? null);
  return {
    orderId: o.orderId, orderName: String(o.name).replace(/^#/, ""), orderDate: o.createdAt, customer: o.customerName ?? "", email: o.email ?? "", postcode: o.postcode ?? "",
    payment: o.gateway ?? "", totalMinor: o.totalMinor, balanceMinor: o.outstandingMinor, paidMinor: Math.max(0, o.totalMinor - o.outstandingMinor),
    refund: refundMark(o, lineStatuses), statuses: lineStatuses,
  };
};

/** { rows, total, page, pageCount, size, balanceMinor, paidMinor } newest order first; the two sums add up the rows shown. */
export async function listBalancePending(db, shop, params = {}) {
  const { orders, byOrder } = await owingOrders(db, shop);
  const all = orders
    .filter((o) => matches(o, params.q))
    .map((o) => toRow(o, byOrder.get(o.orderId) ?? []))
    .filter((r) => isListed(r.statuses, params.status ?? 0));
  const total = all.length;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = params.all ? 1 : Math.min(Math.max(1, params.page ?? 1), pageCount);
  const rows = params.all ? all : all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return {
    rows, total, page, pageCount, size: PAGE_SIZE,
    balanceMinor: rows.reduce((s, r) => s + r.balanceMinor, 0), paidMinor: rows.reduce((s, r) => s + r.paidMinor, 0),
  };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (head, rows) => `﻿${[head.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n")}\r\n`;
const money = (minor) => (minor / 100).toFixed(2);
const uk = (d) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "long", year: "numeric" });
const longDate = (d) => uk(d).replace(/^(\d+) (\w+) (\d+)$/, "$2 $1 $3");
const dmy = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) : "---");
const ymdToDmy = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s.split("-").reverse().join("/") : "---");

/** The rows for the ticked orders (numeric order ids) that still owe money, whatever status filter the page had on. */
export async function balancePendingRowsFor(db, shop, numericIds) {
  const wanted = new Set(numericIds.map((n) => `gid://shopify/Order/${n}`));
  const { orders, byOrder } = await owingOrders(db, shop);
  return orders.filter((o) => wanted.has(o.orderId)).map((o) => toRow(o, byOrder.get(o.orderId) ?? []));
}

/** The old "export ticked" file: one row per order; Status is the order's first line's. */
export function balancePendingCsv(rows) {
  return csv(
    ["Order No", "Order Date", "Customer", "Grand Total", "Balance Amount", "Status", "ePaymentOption"],
    rows.map((r) => [r.orderName, longDate(r.orderDate), r.customer, money(r.totalMinor), money(r.balanceMinor), statusLabel(r.statuses[0]), r.payment]),
  );
}

export const balancePendingFileName = (status) => `${status ? `${statusLabel(status)} - ` : ""}Pending-Balance.csv`;

/** The line's sale price after its discounts, in pence. */
const finalMinor = (l) => l.priceMinor * l.quantity - (l.discountMinor ?? 0);

/**
 * The old "Download All" file: one row per line of every owing order (whatever the page shows), leaving out lines in
 * DOWNLOAD_HIDDEN. Deposit and Balance split the order's paid and owed amounts over its live lines by final sale price.
 * Unit cost comes from Shopify; { csv, count, costLookup: "ok" | "unavailable" }.
 */
export async function balancePendingAllCsv(db, graphql, shop, today = new Date()) {
  const { orders, byOrder } = await owingOrders(db, shop);
  const out = [];
  for (const o of orders) {
    const lines = byOrder.get(o.orderId) ?? [];
    const shareBase = lines.filter((l) => SHARE_STATUSES.includes(l.lineStatusId)).reduce((s, l) => s + finalMinor(l), 0);
    const paidMinor = Math.max(0, o.totalMinor - o.outstandingMinor);
    for (const l of lines) {
      if (DOWNLOAD_HIDDEN.includes(l.lineStatusId)) continue;
      out.push({ o, l, paidMinor, shareBase });
    }
  }
  let costs = new Map();
  let costLookup = "ok";
  if (graphql && out.length) {
    try {
      costs = await lookupCosts(graphql, out.map((x) => x.l.variantId));
    } catch (error) {
      console.error("Balance Pending: cost lookup failed", error.message);
      costLookup = "unavailable";
    }
  }
  const share = (amount, x) => (x.shareBase > 0 ? money(Math.round((amount / x.shareBase) * finalMinor(x.l))) : "");
  const body = out.map((x) => {
    const unitCost = costs.get(x.l.variantId)?.costMinor ?? null;
    return [
      dmy(x.o.createdAt), String(x.o.name).replace(/^#/, ""), x.l.vendor ?? "", x.l.title, x.l.quantity,
      unitCost == null ? "" : money(unitCost), unitCost == null ? "" : money(unitCost * x.l.quantity),
      money(x.l.priceMinor), money(x.l.priceMinor * x.l.quantity), money(finalMinor(x.l)),
      x.paidMinor > 0 ? share(x.paidMinor, x) : "", x.o.outstandingMinor > 0 ? share(x.o.outstandingMinor, x) : "",
      x.o.gateway ?? "", ymdToDmy(x.l.expectedDate), statusLabel(x.l.lineStatusId),
    ];
  });
  const head = ["Date", "Order No.", "Brand", "Product", "Sold Qty", "Unit Cost", "Total Cost", "Unit Sale Price", "Total Sale Price", "Final Sale Price", "Deposit Amount", "Balance Amount", "ePaymentOption", "Exp Due Date", "Status"];
  return { csv: csv(head, body), count: body.length, costLookup, fileName: `Balance-Pending-${dmy(today).replace(/\//g, "-")}.csv` };
}
