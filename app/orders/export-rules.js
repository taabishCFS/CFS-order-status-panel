// Pure rules for the Orders by Brand CSV exports (legacy Export 2 and Export 3). No database or Shopify access.
export const EXPORT_HEADERS = {
  2: ["iOrderDetailId", "Order Date", "Order Number", "Product Name", "Product Code", "Size Options", "Color", "Qty", "Order Status", "Expected Date", "New Expected Date", "SO No."],
  3: ["Order Date", "Order Number", "Brand Name", "Range Name", "Product Name", "Product Code", "Size Options", "Product Cost", "Variant & Access COST", "Unit Sale", "Qty", "Total Sale", "Final Sale Price", "PO Number", "Order Status", "Expected Date"],
};

/** One CSV cell. Text that a spreadsheet would run as a formula gets a leading apostrophe. */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && (/^[=+@\t\r]/.test(text) || /^-(?![\d.]+$|-+$)/.test(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const buildCsv = (headers, rows) => [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

const ukDate = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const pounds = (minor) => (minor / 100).toFixed(2);

/**
 * One export row. `line` is a stored OrderLine; ctx is { orderName, statusLabel, cost }, where
 * cost is null or { costMinor: number | null, range: string } looked up in Shopify.
 */
export function exportRow(kind, line, ctx) {
  const date = ukDate(line.orderCreatedAt);
  const size = line.variantTitle || "---";
  if (kind === 2) {
    return [line.lineId.split("/").pop(), date, ctx.orderName, line.title, line.sku ?? "", size, "---", line.quantity, ctx.statusLabel ?? "", dmy(line.expectedDate), "", ""];
  }
  const cost = ctx.cost?.costMinor;
  const finalUnit = Math.round((line.priceMinor * line.quantity - line.discountMinor) / line.quantity);
  return [
    date, ctx.orderName, line.vendor?.trim() || "Unmapped", ctx.cost?.range ?? "", line.title, line.sku ?? "", line.variantTitle ?? "",
    cost == null ? "" : String(cost / 100), cost == null ? "" : pounds(cost),
    pounds(line.priceMinor), line.quantity, pounds(line.priceMinor * line.quantity), pounds(finalUnit),
    "", ctx.statusLabel ?? "", dmy(line.expectedDate),
  ];
}
