// Reschedule Delivery Orders (legacy rescheduleDelivery_order): lines rescheduled after a delivery attempt ("Delivery attempted before? Yes"),
// with the price, the charge the customer agreed to (often none) and how many times. Cancelled (7) and Deleted (9) lines are left out, as in the old page.
export const PAGE_SIZE = 50;
const SKIP_STATUS_IDS = [7, 9];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;

/** Reads ?brand=&from=&to=&q=&page=&all=1&lines=. */
export function parseRescheduleParams(searchParams) {
  const page = Number(searchParams.get("page"));
  let from = DATE.test(searchParams.get("from") ?? "") ? searchParams.get("from") : "";
  let to = DATE.test(searchParams.get("to") ?? "") ? searchParams.get("to") : "";
  if (from && to && from > to) [from, to] = [to, from];
  return {
    brand: (searchParams.get("brand") ?? "").trim().slice(0, 200),
    q: (searchParams.get("q") ?? "").trim().slice(0, 100),
    from, to,
    lines: [...new Set((searchParams.get("lines") ?? "").split(",").filter((l) => LINE_ID.test(l)))].slice(0, 500),
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

const inRange = (date, from, to) => {
  if (!from && !to) return true;
  if (!date) return false;
  const day = new Date(date).toISOString().slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
};

/** { rows, total, page, pageCount, size, brands }. Newest order first. */
export async function listReschedules(db, shop, params) {
  const charges = await db.lineReschedule.findMany({ where: { shop, count: { gt: 0 } } });
  if (charges.length === 0) return { rows: [], total: 0, page: 1, pageCount: 1, size: PAGE_SIZE, brands: [] };
  const chargeOf = new Map(charges.map((c) => [c.lineId, c]));
  const lines = (await db.orderLine.findMany({ where: { shop, lineId: { in: [...chargeOf.keys()] } } })).filter((l) => !SKIP_STATUS_IDS.includes(l.lineStatusId));
  const orders = await db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } }, select: { orderId: true, name: true } });
  const nameOf = new Map(orders.map((o) => [o.orderId, String(o.name ?? "").replace(/^#/, "")]));
  const all = lines.map((l) => ({
    lineId: l.lineId, orderId: l.orderId, orderName: nameOf.get(l.orderId) ?? "", orderDate: l.orderCreatedAt ?? null,
    title: l.title, variantTitle: l.variantTitle ?? "", brand: l.vendor ?? "", priceMinor: l.priceMinor,
    chargeMinor: chargeOf.get(l.lineId).chargeMinor, count: chargeOf.get(l.lineId).count,
  }));
  const brands = [...new Set(all.map((r) => r.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const q = params.q?.toLowerCase();
  const picked = all
    .filter((r) => !params.brand || r.brand === params.brand)
    .filter((r) => inRange(r.orderDate, params.from, params.to))
    .filter((r) => !q || [r.title, r.brand, r.orderName].some((v) => v.toLowerCase().includes(q)))
    .filter((r) => !params.lines?.length || params.lines.includes(r.lineId))
    .sort((a, b) => (new Date(b.orderDate ?? 0) - new Date(a.orderDate ?? 0)) || a.lineId.localeCompare(b.lineId));
  const total = picked.length;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = params.all ? 1 : Math.min(Math.max(1, params.page ?? 1), pageCount);
  const rows = params.all ? picked : picked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows, total, page, pageCount, size: PAGE_SIZE, brands };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (m) => (m == null ? "" : (m / 100).toFixed(2));

/** The old download: Order Number, Product Name, Brand Name, Price, Reschedule Charge, Reschedule Count. */
export function rescheduleCsv(rows) {
  const head = "Order Number,Product Name,Brand Name,Price,Reschedule Charge,Reschedule Count";
  const body = rows.map((r) => [r.orderName, r.variantTitle ? `${r.title} - ${r.variantTitle}` : r.title, r.brand, money(r.priceMinor), money(r.chargeMinor), r.count].map(cell).join(","));
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}
