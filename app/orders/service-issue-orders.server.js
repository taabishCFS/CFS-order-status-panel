// Service Issue Orders (legacy "Service Issue (Sameer)", serviceIssue.inc): every item of a replacement order (number starts with R)
// or of an order with Service Issue (15), with how long it has taken. An item that is Completed, Cancelled, Credit Note Received or
// Collection counts as finished on the day it got that status; the others are still running today.
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };

const LABEL = new Map(statuses.map((x) => [x.id, x.label]));
export const PAGE_SIZE = 50;
export const MAX_ALL = 2000;
export const SERVICE_ISSUE = 15;
export const FINISHED = [6, 7, 22, 31];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v) => (typeof v === "string" && DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);

/** Reads ?from=&to=&takenBy=&q=&page=&all=1 (the dates are the supplier expected date, as on the old page). */
export function parseServiceOrderParams(sp) {
  let from = realDay(sp.get("from"));
  let to = realDay(sp.get("to"));
  if (from && !to) to = from;
  if (to && !from) from = to;
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(sp.get("page"));
  return {
    from, to,
    takenBy: (sp.get("takenBy") ?? "").trim().slice(0, 100),
    q: (sp.get("q") ?? "").trim().replace(/^#/, "").slice(0, 50),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    all: sp.get("all") === "1",
  };
}

const orderWhere = (shop, p) => {
  const and = [
    { shop },
    { OR: [{ orderStatusId: SERVICE_ISSUE }, { lineStatusIds: { has: SERVICE_ISSUE } }, { name: { startsWith: "R", mode: "insensitive" } }, { name: { startsWith: "#R", mode: "insensitive" } }] },
  ];
  if (p.takenBy) and.push({ orderTakenBy: { equals: p.takenBy, mode: "insensitive" } });
  if (p.q) and.push({ name: { contains: p.q, mode: "insensitive" } });
  return { AND: and };
};

const DAY_MS = 86400000;
/** Whole days from the order to when the item finished (or now). */
export const daysTaken = (orderDate, endAt) => Math.max(0, Math.round((new Date(endAt) - new Date(orderDate)) / DAY_MS));

/** { rows, total, page, pageCount, size, takers } */
export async function listServiceOrders(db, shop, p, now = new Date()) {
  const orders = await db.order.findMany({ where: orderWhere(shop, p), select: { orderId: true, name: true, createdAt: true, orderTakenBy: true } });
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const lineWhere = { shop, orderId: { in: [...orderOf.keys()] } };
  if (p.from) lineWhere.expectedDate = { gte: p.from, lte: p.to };
  const lines = orders.length
    ? await db.orderLine.findMany({
      where: lineWhere,
      select: { lineId: true, orderId: true, title: true, sku: true, quantity: true, vendor: true, lineStatusId: true, expectedDate: true, statusAt: true, statusBy: true, serviceRemarks: true },
    })
    : [];
  const rows = lines.map((l) => {
    const o = orderOf.get(l.orderId);
    const finished = FINISHED.includes(l.lineStatusId) && l.statusAt ? l.statusAt : null;
    return {
      lineId: l.lineId,
      orderId: l.orderId,
      orderName: o.name,
      orderDate: o.createdAt,
      takenBy: o.orderTakenBy ?? null,
      product: l.title,
      sku: l.sku,
      quantity: l.quantity,
      brand: l.vendor,
      statusId: l.lineStatusId,
      expectedDate: l.expectedDate,
      finishedAt: finished,
      finishedBy: finished ? l.statusBy : null,
      // A finished item whose finishing day is not known (before the app kept it) has no duration.
      days: FINISHED.includes(l.lineStatusId) && !finished ? null : daysTaken(o.createdAt, finished ?? now),
      serviceRemarks: l.serviceRemarks,
    };
  });
  rows.sort((a, b) => b.orderDate - a.orderDate || a.orderName.localeCompare(b.orderName) || a.lineId.localeCompare(b.lineId));
  const takers = (await db.order.findMany({ where: { AND: orderWhere(shop, { q: "", takenBy: "" }).AND.concat({ orderTakenBy: { not: null } }) }, select: { orderTakenBy: true }, distinct: ["orderTakenBy"] }))
    .map((t) => t.orderTakenBy.trim()).filter(Boolean);
  const total = rows.length;
  const size = p.all ? MAX_ALL : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = p.all ? 1 : Math.min(p.page, pageCount);
  return {
    rows: rows.slice((page - 1) * size, page * size), total, page, pageCount, size,
    takers: [...new Map(takers.map((t) => [t.toLowerCase(), t])).values()].sort((a, b) => a.localeCompare(b)),
    capped: p.all && total > MAX_ALL,
  };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ukDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) : "");
const dmy = (d) => (d ? d.split("-").reverse().join("/") : "");

export async function serviceOrdersCsv(db, shop, p) {
  const list = await listServiceOrders(db, shop, { ...p, all: true });
  const head = ["Order Date", "Order No.", "Item", "Product Code", "Qty", "Order Taken By", "Status", "Sup. Expected Date", "Completed Date", "Completed By", "Process Duration (days)", "Service Remarks"];
  const body = list.rows.map((r) => [ukDate(r.orderDate), r.orderName, r.product, r.sku, r.quantity, r.takenBy, r.statusId ? LABEL.get(r.statusId) ?? `Status ${r.statusId}` : "", dmy(r.expectedDate), ukDate(r.finishedAt), r.finishedBy, r.days, r.serviceRemarks]);
  const csv = `﻿${[head.join(","), ...body.map((r) => r.map(cell).join(","))].join("\r\n")}\r\n`;
  return { csv, count: body.length, fileName: "Service-Issue.csv" };
}
