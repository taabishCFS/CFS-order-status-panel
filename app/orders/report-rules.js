// Pure rules for the Reports downloads (legacy "Xero VAT Invoice Report" and "Delivery Report"). No database or Shopify access.
import { buildCsv } from "./export-rules.js";

export const MAX_REPORT_ORDERS = 5000;
export const MAX_RANGE_DAYS = 366;

/** Line statuses that mean "ready for delivery" (legacy Order_delivery_report). */
export const DELIVERY_STATUS_IDS = [4, 5, 14, 17, 31, 33, 43, 44, 45, 46, 61];

export const REPORTS = {
  xero: { title: "Xero VAT Invoice Report", needsDates: true },
  delivery: { title: "Delivery Report", needsDates: false },
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (text) => ISO.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);

/** { from, to, gte, lte } for a YYYY-MM-DD range (UTC, both days included), or null when missing, invalid, reversed or longer than a year. */
export function parseReportRange(from, to) {
  if (!validDay(from ?? "") || !validDay(to ?? "")) return null;
  const gte = new Date(`${from}T00:00:00.000Z`);
  const lte = new Date(`${to}T23:59:59.999Z`);
  if (lte < gte || (lte - gte) / 86_400_000 > MAX_RANGE_DAYS) return null;
  return { from, to, gte, lte };
}

export function reportFilename(kind, range) {
  return kind === "xero" ? `Xero_Report-${range.from}_to_${range.to}.csv` : "delivery_report.csv";
}

const ukDate = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const money = (minor) => (minor / 100).toFixed(2);
const parseAddress = (text) => {
  if (!text) return null;
  try {
    const value = typeof text === "string" ? JSON.parse(text) : text;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

export const XERO_HEADERS = [
  "ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity", "PORegion", "POPostalCode", "POCountry",
  "InvoiceNumber", "Reference", "InvoiceDate", "DueDate", "Total", "InventoryItemCode", "Description", "Quantity", "UnitAmount", "Discount",
  "AccountCode", "TaxType", "TaxAmount", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2", "Currency", "BrandingTheme",
];

/** One Xero invoice row per order. VAT is one sixth of the total (20% included in the price), as in the legacy report. */
export function xeroRow(order, lines) {
  const address = parseAddress(order.billingAddress) ?? parseAddress(order.shippingAddress) ?? {};
  const net = Math.round(order.totalMinor / 1.2);
  const date = ukDate(order.createdAt);
  // Placeholder rule until staff confirm: the legacy report tagged one brand "Urban Deco".
  const urbanDeco = lines.some((l) => /urban deco/i.test(l.vendor ?? ""));
  return [
    address.name || order.customerName || "", order.email ?? "", address.address1 ?? "", address.address2 ?? "", "", "",
    address.city ?? "", address.province ?? "", address.zip ?? "", address.country ?? "",
    String(order.name).replace(/^#/, ""), "", date, date, money(order.totalMinor),
    lines.map((l) => l.sku).filter(Boolean).join(", "), lines.map((l) => l.title).join(", "), 1, money(net), "",
    "200", "20% (VAT on Income)", money(order.totalMinor - net),
    urbanDeco ? "Brand" : "", urbanDeco ? "Urban Deco" : "", "", "", order.currency ?? "GBP", "",
  ];
}

export const xeroCsv = (orders, linesByOrder) => buildCsv(XERO_HEADERS, orders.map((o) => xeroRow(o, linesByOrder.get(o.orderId) ?? [])));

export const DELIVERY_HEADERS = [
  "S.No.", "Order No", "Date of Order", "Address 1", "Address 2", "Capacity", "Volume", "Distribution CentreName", "Drop Window Start", "Drop Window End",
  "Drop Duration", "Client Name", "Contact Number", "Order Date From", "Order Date To",
];

/** True when every product line is ready for delivery and nothing is owed (legacy rule). */
export const readyForDelivery = (order, lines) =>
  !order.cancelledAt && order.outstandingMinor <= 0 && lines.length > 0 && lines.every((l) => DELIVERY_STATUS_IDS.includes(l.lineStatusId));

/** The delivery sheet for the orders that are ready. The depot name and drop window are the legacy constants (placeholders until staff confirm). */
export function deliveryCsv(orders, linesByOrder) {
  const rows = [];
  for (const order of orders) {
    const lines = linesByOrder.get(order.orderId) ?? [];
    if (!readyForDelivery(order, lines)) continue;
    const a = parseAddress(order.shippingAddress) ?? {};
    const date = ukDate(order.createdAt);
    rows.push([
      rows.length + 1, String(order.name).replace(/^#/, ""), date, a.address1 ?? "",
      [a.address2, a.city, a.province, a.country, a.zip].filter(Boolean).join(", "),
      "", "", "Choice Furniture", "7:30", "16:00", "15", a.name || order.customerName || "", order.phone ?? a.phone ?? "", date, "--",
    ]);
  }
  return { csv: buildCsv(DELIVERY_HEADERS, rows), count: rows.length };
}
