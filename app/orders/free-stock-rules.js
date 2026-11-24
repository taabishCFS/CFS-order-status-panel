// Pure rules for free stock: reading a spreadsheet row and writing the stock list as CSV. No database access.
import { buildCsv } from "./export-rules.js";

export const FREE_STOCK_HEADERS = ["Item Type", "Source Order", "Brand", "Product Name", "Qty", "Product Code", "Warehouse Code", "RMA", "Remarks", "Cost", "Credit/FOC", "Status", "Collection"];

export const MAX_QTY = 100000;
const LIMITS = { itemType: 40, sourceOrder: 100, brand: 200, productName: 300, productCode: 100, warehouseCode: 60, rma: 100, remarks: 2000, creditFoc: 40, status: 60, collection: 60 };

/** Cost text such as "12.50" or "£1,250.5" as pence, null when blank, or "bad" when it is not a money amount. */
export function parseCostMinor(text) {
  const t = String(text ?? "").replace(/[£,\s]/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "bad";
  return Math.round(Number(t) * 100);
}

const clean = (value, max) => String(value ?? "").trim().slice(0, max);

/**
 * One free-stock row from a form or spreadsheet: { ok: true, data } ready to save, or { ok: false, reason }.
 * Needs a brand, a product code and a whole-number quantity of at least 1. A blank item type means "freeStock".
 */
export function normaliseFreeStock(raw) {
  const brand = clean(raw?.brand, LIMITS.brand);
  const productCode = clean(raw?.productCode, LIMITS.productCode);
  if (!brand) return { ok: false, reason: "The brand is empty." };
  if (!productCode) return { ok: false, reason: `The product code is empty (${brand}).` };
  const qtyText = String(raw?.qty ?? "").trim();
  if (!/^\d+$/.test(qtyText) || Number(qtyText) < 1 || Number(qtyText) > MAX_QTY) return { ok: false, reason: `The quantity "${qtyText.slice(0, 20)}" for ${productCode} must be a whole number from 1 to ${MAX_QTY}.` };
  const costMinor = parseCostMinor(raw?.cost);
  if (costMinor === "bad") return { ok: false, reason: `The cost "${String(raw.cost).slice(0, 20)}" for ${productCode} is not an amount like 12.50.` };
  const orNull = (v, max) => clean(v, max) || null;
  return {
    ok: true,
    data: {
      itemType: clean(raw?.itemType, LIMITS.itemType) || "freeStock",
      sourceOrder: orNull(raw?.sourceOrder, LIMITS.sourceOrder),
      brand,
      productName: clean(raw?.productName, LIMITS.productName) || productCode,
      productCode,
      qty: Number(qtyText),
      costMinor,
      warehouseCode: orNull(raw?.warehouseCode, LIMITS.warehouseCode),
      rma: orNull(raw?.rma, LIMITS.rma),
      remarks: orNull(raw?.remarks, LIMITS.remarks),
      creditFoc: orNull(raw?.creditFoc, LIMITS.creditFoc),
      status: orNull(raw?.status, LIMITS.status),
      collection: orNull(raw?.collection, LIMITS.collection),
    },
  };
}

/** The code shown for a stock record: the one typed in, or "FSS" plus its running number. */
export const warehouseCodeOf = (row) => row.warehouseCode || `FSS${row.seq}`;

const money = (minor) => (minor == null ? "" : (minor / 100).toFixed(2));

export const freeStockRow = (r) => [r.itemType, r.sourceOrder ?? "", r.brand, r.productName, r.qty, r.productCode, warehouseCodeOf(r), r.rma ?? "", r.remarks ?? "", money(r.costMinor), r.creditFoc ?? "", r.status ?? "", r.collection ?? ""];

/** The stock list as a spreadsheet. */
export const freeStockCsv = (rows) => buildCsv(FREE_STOCK_HEADERS, rows.map(freeStockRow));

/** A sample to fill in and import: the headings and one example row. */
export const freeStockSampleCsv = () =>
  buildCsv(FREE_STOCK_HEADERS, [["freeStock", "12345", "Example Brand", "Example Bed 4ft6 Grey", 2, "EX-BED-46-GR", "", "", "Cancelled order, still boxed", "125.00", "", "", ""]]);
