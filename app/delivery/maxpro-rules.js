// Rules for the Delivery Report CSV (Max) page ("Maxpro") and its two exports. No database access here.
// Copied from the legacy order_maxpro_delivery pages: which orders are listed, the columns, and the file layout.

/** A line counts for Maxpro when it is in one of these statuses (legacy list, with 74 and 75 added on the page). */
export const MAXPRO_STATUSES = [4, 14, 31, 33, 43, 44, 45, 46, 47, 48, 49, 55, 61, 69, 74, 75];
/** An order is left out when ANY of its lines is in one of these (cancelled, deleted, failed, awaiting payment ...). */
export const RESTRICTED_STATUSES = [10, 12, 40, 35, 57, 5, 1, 3, 15, 63];
export const PAGE_SIZE = 100;
export const ALL_SIZE = 2000;
export const MAX_EXPORT_ORDERS = 500;

export const CENTRE = "Choice Furniture";
export const WINDOW_START = "7:30";
export const WINDOW_END = "16:00";
export const DURATION = "15";

const isWhiteGlove = (title) => /\[svc:white_glove\]/.test(title ?? "");

/** Does any of the order's line titles carry the White Glove service marker? */
export const orderIsWhiteGlove = (titles) => titles.some(isWhiteGlove);

/** Reads ?q=&brand=&wg=&page=&all= of the page. */
export function parseMaxproParams(searchParams) {
  const page = Number(searchParams.get("page"));
  const brand = searchParams.get("brand")?.trim();
  return {
    q: (searchParams.get("q") ?? "").trim().slice(0, 200),
    brand: brand ? brand.slice(0, 200) : null,
    whiteGlove: searchParams.get("wg") === "1",
    all: searchParams.get("all") === "1",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** Does the order match "Find order / customer"? (order number, customer name, email, phone or postcode contain the text) */
export function matchesSearch(q, order) {
  const text = q.trim().toLowerCase().replace(/^#/, "");
  if (!text) return true;
  return [order.name?.replace(/^#/, ""), order.customerName, order.email, order.phone, order.postcode].some((v) => (v ?? "").toLowerCase().includes(text));
}

/** The two address columns: street, then "house/flat, city, county, country, postcode" like the old file. */
export function addressColumns(shipping) {
  const a = shipping && typeof shipping === "object" ? shipping : {};
  const parts = [a.address2, a.city, a.province, a.countryCode ?? a.countryCodeV2 ?? a.country, a.zip].map((p) => (p ?? "").toString().trim());
  return { address1: (a.address1 ?? "").toString().trim(), address2: parts.join(", ") };
}

const dmy = (d) => {
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
};

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** One order's row for the page and the exports. `lines` = the order's lines ({ vendor, lineId, lineStatusId }). */
export function maxproRow(order, lines) {
  const shipping = typeof order.shippingAddress === "string" ? safeJson(order.shippingAddress) : order.shippingAddress;
  const { address1, address2 } = addressColumns(shipping);
  return {
    orderId: order.orderId,
    orderName: order.name,
    date: dmy(order.createdAt),
    address1,
    address2,
    centre: CENTRE,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    duration: DURATION,
    client: (order.customerName ?? shipping?.name ?? "").trim(),
    contact: order.phone ?? shipping?.phone ?? "",
    dateFrom: dmy(order.createdAt),
    dateTo: "",
    statusIds: lines.map((l) => l.lineStatusId),
    brands: lines.map((l) => l.vendor?.trim() || "Unmapped"),
    lineIds: lines.map((l) => l.lineId),
  };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (cells) => cells.map(cell).join(",");
const BOM = "﻿";

const HEAD = ["S.No.", "Order No", "Date of Order", "Address 1", "Address 2", "Capacity", "Volume", "Distribution CentreName", "Drop Window Start", "Drop Window End", "Drop Duration", "Client Name", "Contact Number", "Order Date From", "Order Date To"];
const cols = (n, r) => [n, r.orderName, r.date, r.address1, r.address2, "", "", r.centre, r.windowStart, r.windowEnd, r.duration, r.client, r.contact, r.dateFrom, "--"];

/** MaxPro_Orderwise.csv: one row per order, plus a Brands column ("Brand | Brand | "). */
export function orderWiseCsv(rows) {
  return BOM + [line([...HEAD, "Brands"]), ...rows.map((r, i) => line([...cols(i + 1, r), r.brands.map((b) => `${b} | `).join("")]))].join("\r\n");
}

/** MaxPro_Productwise.csv: one row per line that still needs delivering. `rows` carry `deliverable` (the number of such lines). */
export function productWiseCsv(rows) {
  const out = [line(HEAD)];
  let n = 0;
  for (const r of rows) for (let k = 0; k < r.deliverable; k++) out.push(line(cols(++n, r)));
  return BOM + out.join("\r\n");
}
