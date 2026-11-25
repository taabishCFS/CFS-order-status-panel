// Rules for the Completed Delivery and Failed Delivery/Collection pages. No database access here.

export const KINDS = {
  completed: { statuses: [6], title: "Delivery Completed", file: "delivery_booking_completed.csv" },
  failed: { statuses: [53, 54], title: "Failed Delivery / Collection", file: "failed_delivery_collection.csv" },
};
export const PAGE_SIZE = 100;
export const ALL_SIZE = 2000;
export const PARTNER_FILTERS = ["TNT", "Pallet", "Fur Deco", "Graham Scotland", "Graham Devon"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads ?kind=&q=&brand=&van=&pay=&from=&to=&page=&all=. `van` is a van id or "partner:TNT". */
export function parseOutcomeParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const text = (name, max = 200) => (searchParams.get(name) ?? "").trim().slice(0, max);
  const date = (name) => (DATE.test(searchParams.get(name) ?? "") ? searchParams.get(name) : "");
  const kind = Object.hasOwn(KINDS, searchParams.get("kind")) ? searchParams.get("kind") : "completed";
  let from = date("from");
  let to = date("to");
  if (from && to && from > to) [from, to] = [to, from];
  return {
    kind, from, to,
    q: text("q"), brand: text("brand") || null, van: text("van") || null, pay: text("pay") || null,
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** The partner named by a van filter ("partner:TNT" gives "TNT"), or null. */
export const partnerOf = (van) => (van?.startsWith("partner:") && PARTNER_FILTERS.includes(van.slice(8)) ? van.slice(8) : null);

/** Does the order match the search (order number, postcode or email contains the text)? */
export function matchesOutcomeSearch(q, order) {
  const text = q.trim().toLowerCase().replace(/^#/, "");
  if (!text) return true;
  return [order.name?.replace(/^#/, ""), order.postcode, order.email].some((v) => (v ?? "").toLowerCase().includes(text));
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (cells) => cells.map(cell).join(",");
const dmy = (v) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");
const money = (minor) => ((minor ?? 0) / 100).toFixed(2);
const BOM = "﻿";

/** The CSV of a list (the same columns as the old files). */
export function outcomeCsv(kind, rows) {
  if (kind === "failed") {
    return BOM + [
      line(["Order Date", "Order No.", "Brand", "Item", "Code", "Qty", "Delivery Date", "Driver", "Reason", "Delivery Type", "Status"]),
      ...rows.map((r) => line([dmy(r.orderDate), r.orderName, r.brand, r.product, r.code, r.quantity, dmy(r.date), r.driver, r.reason, r.deliveryType, r.statusLabel])),
    ].join("\r\n");
  }
  return BOM + [
    line(["Order Date", "Order No.", "Email", "Brand", "Item", "Code", "Qty", "Delivery Date", "Postcode", "Van", "Pay Mode", "Final Value"]),
    ...rows.map((r) => line([dmy(r.orderDate), r.orderName, r.email, r.brand, r.product, r.code, r.quantity, dmy(r.date), r.postcode, r.van, r.payMode, money(r.amountMinor)])),
  ].join("\r\n");
}
