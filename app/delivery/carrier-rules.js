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
const confirmText = (r) => (r.confirmed === "confirmed" ? "Confirmed" : "Not Confirmed");

/** The CSV of a carrier list: the columns the old exports share (tracking, volume, weight and box are not held). */
export function carrierCsv(rows) {
  return BOM + [
    line(["Order No", "Brand", "Product Name", "Qty", "Order Date", "Expected Delivery Date", "Last Chaseup Date", "Delivery Date", "Delivery Booked", "Delivery Confirmed?", "Order Status"]),
    ...rows.map((r) => line([r.orderName, r.brand, r.product, r.quantity, dmy(r.orderDate), dmy(r.expectedDate), dmy(r.lastChaseDate), dmy(r.date), r.date ? "Yes" : "No", confirmText(r), label.get(r.lineStatusId) ?? ""])),
  ].join("\r\n");
}
