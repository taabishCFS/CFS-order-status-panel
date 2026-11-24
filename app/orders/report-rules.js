// Pure rules for the Reports downloads (legacy "Xero VAT Invoice Report" and "Delivery Report"). No database or Shopify access.
import { buildCsv } from "./export-rules.js";

export const MAX_REPORT_ORDERS = 5000;
export const MAX_RANGE_DAYS = 366;

/** Line statuses that mean "ready for delivery" (legacy Order_delivery_report). */
export const DELIVERY_STATUS_IDS = [4, 5, 14, 17, 31, 33, 43, 44, 45, 46, 61];

export const REPORTS = {
  xero: { title: "Xero VAT Invoice Report", needsDates: true, needsTerms: false },
  delivery: { title: "Delivery Report", needsDates: false, needsTerms: false },
  outstanding: { title: "Outstanding Payments", needsDates: true, needsTerms: true },
  instock: { title: "Outstanding In-Stock Items", needsDates: true, needsTerms: false },
  unpaid: { title: "Unpaid Invoices Report", needsDates: true, needsTerms: false },
  // Not on the Reports page: the Brand terms screen downloads it (the sample and export for the spreadsheet import).
  brandterms: { title: "Brand terms", needsDates: false, needsTerms: false },
  // Not on the Reports page either: the Stock screen downloads these (the stock list, and a sample to fill in for the import).
  freestock: { title: "Free stock", needsDates: false, needsTerms: false },
  freestocksample: { title: "Free stock sample", needsDates: false, needsTerms: false },
};

/** Line statuses that still count as "we owe the supplier" (legacy Outstanding Payments), by how the brand is paid. */
export const OUTSTANDING_STATUS_IDS = {
  credit: [14, 6, 10, 4, 35, 12, 3, 1, 57, 36],
  proforma: [10, 35, 12, 3, 1, 57, 36],
};
export const TERMS_LABEL = { credit: "Credit", proforma: "Pro-forma" };

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

/**
 * The parts of a report request that come from its link or query: { range, terms }, or null when a part it needs is missing or wrong.
 * `get` reads one value by name (for example URLSearchParams.get).
 */
export function parseReportParams(kind, get) {
  const info = Object.hasOwn(REPORTS, kind) ? REPORTS[kind] : null;
  if (!info) return null;
  let range;
  let terms;
  if (info.needsDates) {
    range = parseReportRange(get("from"), get("to"));
    if (!range) return null;
  }
  if (info.needsTerms) {
    terms = get("terms");
    if (!Object.hasOwn(OUTSTANDING_STATUS_IDS, terms)) return null;
  }
  return { range, terms };
}

/** The link's query string for a report's parameters. */
export const reportQuery = ({ range, terms }) => new URLSearchParams({ ...(range ? { from: range.from, to: range.to } : {}), ...(terms ? { terms } : {}) }).toString();

export function reportFilename(kind, range, terms) {
  if (kind === "xero") return `Xero_Report-${range.from}_to_${range.to}.csv`;
  if (kind === "outstanding") return `${TERMS_LABEL[terms]}_Total-Outstanding-Report-${range.from}_to_${range.to}.csv`;
  if (Object.hasOwn(STOCK_REPORTS, kind)) return `${STOCK_REPORTS[kind].file}-${range.from}_to_${range.to}.csv`;
  if (kind === "brandterms") return "brand_terms.csv";
  if (kind === "freestock") return "free_stock.csv";
  if (kind === "freestocksample") return "free_stock_sample.csv";
  return "delivery_report.csv";
}

const ukDate = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const money = (minor) => (minor / 100).toFixed(2);
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "---");
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

export const OUTSTANDING_HEADERS = ["Order No.", "Order Date", "Brand", "Item", "Qty", "Total Cost", "Item Status", "Expected Date", "Delivery Date"];

/**
 * One outstanding-payments row for a product line. ctx = { orderName, orderCreatedAt, statusLabel, costMinor }.
 * Total cost is the Shopify cost per item times the quantity, blank when Shopify has no cost. The delivery date is blank:
 * the new system does not keep one yet.
 */
export function outstandingRow(line, ctx) {
  return [
    String(ctx.orderName).replace(/^#/, ""), ukDate(ctx.orderCreatedAt), line.vendor?.trim() || "Unmapped", line.title, line.quantity,
    ctx.costMinor == null ? "" : money(ctx.costMinor * line.quantity), ctx.statusLabel ?? "", dmy(line.expectedDate), "",
  ];
}

export const outstandingCsv = (rows) => buildCsv(OUTSTANDING_HEADERS, rows);

export const BRAND_TERMS_HEADERS = ["Brand", "Terms"];

/** The brand list as a spreadsheet: every brand with Credit, Pro-forma or blank. It is also the sample for the import. */
export const brandTermsCsv = (rows) => buildCsv(BRAND_TERMS_HEADERS, rows.map((r) => [r.brand, TERMS_LABEL[r.terms] ?? ""]));

/**
 * The two supplier-payment sheets that share one layout (legacy "Outstanding In-Stock Items" and "Unpaid Invoices Report").
 * Both list product lines that have been in stock, whose supplier invoice is not marked paid, are not "Clearance" items, and were
 * ordered in the date range. They differ only in which line statuses count.
 * - instock: every status except 1, 9, 32, 34, 35 and 50.
 * - unpaid: only 3, 35, 10, 12, 1, 14, 4 and 6.
 * "Has been in stock" means the line has a stock date (it came into In Stock, status 4) or is now DHD with Supplier (status 36).
 */
export const STOCK_REPORTS = {
  instock: { statusFilter: { notIn: [1, 9, 32, 34, 35, 50] }, file: "Total-Outstanding-After-Instock-Report" },
  unpaid: { statusFilter: { in: [3, 35, 10, 12, 1, 14, 4, 6] }, file: "Total-Outstanding-Report" },
};
export const DHD_WITH_SUPPLIER = 36;

export const STOCK_HEADERS = ["Order No.", "Order Date", "Brand", "Item", "Qty", "Total Cost", "Item Status"];

/** One row of the in-stock or unpaid sheet. ctx = { orderName, orderCreatedAt, statusLabel, costMinor }. Cost is the Shopify cost per item times the quantity, blank if none. */
export function stockRow(line, ctx) {
  return [
    String(ctx.orderName).replace(/^#/, ""), ukDate(ctx.orderCreatedAt), line.vendor?.trim() || "Unmapped", line.title, line.quantity,
    ctx.costMinor == null ? "" : money(ctx.costMinor * line.quantity), ctx.statusLabel ?? "",
  ];
}

export const stockCsv = (rows) => buildCsv(STOCK_HEADERS, rows);
