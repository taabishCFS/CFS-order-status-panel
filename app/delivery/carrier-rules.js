// Rules for the Carrier Deliveries pages (TNT, Pallet, FurDeco, DHD, White Glove, Allocated From Stock + Delivery Booked).
// One list of order lines each, from the legacy tnt_orders / pallet_orders / furdeco_orders / dhd_orders / white_glove_delivery_orders pages.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";

const label = new Map(statuses.map((s) => [s.id, s.label]));

/**
 * What each page lists. `partner`: lines marked for that carrier. `booked`: lines booked onto one of our vans with a date.
 * `statuses`: only these line statuses; `except`: every status but these; `whiteGlove`: orders that bought White Glove delivery.
 */
export const CARRIERS = {
  tnt: { title: "TNT Orders", partner: "TNT", statuses: [4, 14, 43, 61, 31, 46, 45, 44], file: "tnt_orders.csv", emailLabel: "Send TNT Email" },
  pallet: { title: "Pallet Orders", partner: "Pallet", except: [6, 7, 9, 32, 58, 50], file: "pallet_orders.csv", emailLabel: "Send Pallet Email" },
  furdeco: { title: "FurDeco Orders", partner: "Fur Deco", statuses: [4, 14, 43, 61, 31, 46, 45, 44, 82, 47, 48, 49, 55], file: "furdeco_orders.csv", emailLabel: "Send FurDeco Email" },
  dhd: { title: "DHD Orders", statuses: [36], file: "dhd_orders.csv", emailLabel: "Send Email" },
  "white-glove": { title: "White Glove Delivery Orders", whiteGlove: true, statuses: [4, 14, 31, 33, 40, 43, 44, 45, 46, 47, 48, 49], file: "white_glove_delivery_orders.csv", emailLabel: "Send Email" },
  allocated: { title: "Allocated From Stock + Delivery Booked", booked: true, statuses: [5, 43], file: "allocated_from_stock_with_delivery_booked.csv", emailLabel: "Send Email" },
};
export const PAGE_SIZE = 100;
export const ALL_SIZE = 2000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Does a line status belong on the page? */
export const statusWanted = (cfg, statusId) => (cfg.except ? !cfg.except.includes(statusId) : cfg.statuses.includes(statusId));

/** Reads ?key=&q=&brand=&van=&from=&to=&page=&all=. */
export function parseCarrierParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const text = (name, max = 200) => (searchParams.get(name) ?? "").trim().slice(0, max);
  const date = (name) => (DATE.test(searchParams.get(name) ?? "") ? searchParams.get(name) : "");
  let from = date("from");
  let to = date("to");
  if (from && to && from > to) [from, to] = [to, from];
  return {
    key: Object.hasOwn(CARRIERS, searchParams.get("key")) ? searchParams.get("key") : "tnt",
    from, to, q: text("q"), brand: text("brand") || null, van: text("van") || null,
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** Does the order match the search (order number, postcode or email contains the text)? */
export function matchesCarrierSearch(q, order) {
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
const BOM = "﻿";
const confirmText = (r) => (r.confirmed === "confirmed" ? "Confirmed" : r.confirmed === "declined" ? "Declined" : "Not Confirmed");

/** The CSV of a carrier list: the columns the old exports share (tracking, volume, weight and box are not held). */
export function carrierCsv(rows) {
  return BOM + [
    line(["Order No", "Brand", "Product Name", "Qty", "Order Date", "Expected Delivery Date", "Last Chaseup Date", "Delivery Date", "Delivery Booked", "Delivery Confirmed?", "Order Status"]),
    ...rows.map((r) => line([r.orderName, r.brand, r.product, r.quantity, dmy(r.orderDate), dmy(r.expectedDate), dmy(r.lastChaseDate), dmy(r.date), r.date ? "Yes" : "No", confirmText(r), label.get(r.lineStatusId) ?? ""])),
  ].join("\r\n");
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const confirmLabel = (r) => (r.confirmed === "confirmed" ? "Confirmed" : r.confirmed === "declined" ? "Declined" : "");
const PRINT_COLUMNS = [
  ["Order Date", (r) => dmy(r.orderDate), 7], ["Order No.", (r) => r.orderName, 8], ["Brand", (r) => r.brand, 7],
  ["Item", (r) => `${esc(r.product)}${r.size ? `<br><small>${esc(r.size)}</small>` : ""}`, 24, true], ["Code", (r) => r.code, 9], ["Qty", (r) => r.quantity, 3],
  ["Delv. Date", (r) => dmy(r.date), 7], ["Van", (r) => r.van, 6], ["Driver", (r) => r.driver, 7], ["Drop", (r) => (r.drop ? `Drop ${r.drop}` : ""), 4],
  ["Slot", (r) => r.slot, 3], ["Del. Type", (r) => r.deliveryType, 8], ["Del. Confirm", confirmLabel, 6], ["Status", (r) => label.get(r.lineStatusId) ?? "", 8],
];

/** A print-ready A4 landscape page (Save as PDF in the print box): every column of Allocated From Stock + Delivery Booked. */
export function carrierPrintHtml(title, rows, stamp) {
  const head = PRINT_COLUMNS.map(([name, , width]) => `<th style="width:${width}%">${esc(name)}</th>`).join("");
  const body = rows.map((r) => `<tr>${PRINT_COLUMNS.map(([, get, , raw]) => `<td>${raw ? get(r) : esc(get(r))}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}_${esc(stamp)}</title><style>
@page{size:A4 landscape;margin:8mm}body{font:9px/1.3 Arial,sans-serif;color:#111;margin:0}h1{font-size:14px;margin:0 0 4px}p{margin:0 0 6px;color:#555}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bbb;padding:2px 3px;text-align:left;vertical-align:top;word-wrap:break-word}th{background:#eee}thead{display:table-header-group}tr{page-break-inside:avoid}small{color:#555}
</style></head><body><h1>${esc(title)}</h1><p>${rows.length} lines &middot; printed ${esc(stamp)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`;
}
