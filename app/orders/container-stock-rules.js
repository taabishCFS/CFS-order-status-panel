// Pure rules for container stock: reading a spreadsheet row and writing the list as CSV. No database access.
import { buildCsv } from "./export-rules.js";
import { parseCostMinor } from "./free-stock-rules.js";

// The old system turned the dollar cost into pounds at this rate when none was set.
export const DOLLAR_TO_POUND_RATE = 0.81;
export const MAX_QTY = 1000000;

export const CONTAINER_HEADERS = ["SKU", "Item Vendor", "Container No", "Product Name", "Product Code", "WHS Code", "Cost ($)", "Price", "Delivery Cost", "Added Qty", "Qty", "Total CBM", "Expected Date", "Container Range"];

const LIMITS = { sku: 100, itemVendor: 200, containerNo: 60, productName: 300, productCode: 100, warehouseCode: 60, containerRange: 200 };
const clean = (value, max) => String(value ?? "").trim().slice(0, max);

/** A date as typed: 2026-12-31 or 31/12/2026 (day first). Returns a Date at midday UTC, null when blank, or "bad". */
export function parseExpectedDate(text) {
  const t = String(text ?? "").trim();
  if (t === "") return null;
  let y, m, d;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (hit) [y, m, d] = [hit[1], hit[2], hit[3]];
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [d, m, y] = [hit[1], hit[2], hit[3]];
  else return "bad";
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d) ? date : "bad";
}

const wholeQty = (text) => (/^\d+$/.test(String(text ?? "").trim()) && Number(text) <= MAX_QTY ? Number(text) : null);

/**
 * One container row from a form or spreadsheet: { ok: true, data } ready to save, or { ok: false, reason }.
 * Needs an item vendor, container number, product code and a quantity. Added Qty and Qty may be left blank (each copies the other).
 * The pound cost is the dollar cost times the rate. `qtyMin` is 0 when correcting a record (0 marks it used up).
 */
export function normaliseContainer(raw, { qtyMin = 1 } = {}) {
  const itemVendor = clean(raw?.itemVendor, LIMITS.itemVendor);
  const containerNo = clean(raw?.containerNo, LIMITS.containerNo);
  const productCode = clean(raw?.productCode, LIMITS.productCode);
  if (!itemVendor) return { ok: false, reason: "The item vendor is empty." };
  if (!containerNo) return { ok: false, reason: `The container number is empty (${productCode || itemVendor}).` };
  if (!productCode) return { ok: false, reason: `The product code is empty (${itemVendor}, container ${containerNo}).` };
  const addedText = String(raw?.addedQty ?? "").trim();
  const qtyText = String(raw?.qty ?? "").trim();
  let addedQty = addedText === "" ? null : wholeQty(addedText);
  let qty = qtyText === "" ? null : wholeQty(qtyText);
  if ((addedText !== "" && addedQty === null) || (qtyText !== "" && qty === null)) return { ok: false, reason: `The quantity for ${productCode} must be a whole number.` };
  if (addedQty === null && qty === null) return { ok: false, reason: `The quantity for ${productCode} is empty.` };
  if (addedQty === null) addedQty = qty;
  if (qty === null) qty = addedQty;
  if (qty < qtyMin || addedQty < 1) return { ok: false, reason: `The quantity for ${productCode} must be ${qtyMin} or more.` };
  const dollar = parseCostMinor(raw?.costDollar);
  if (dollar === "bad") return { ok: false, reason: `The dollar cost "${String(raw.costDollar).slice(0, 20)}" for ${productCode} is not an amount like 12.50.` };
  const price = parseCostMinor(raw?.price);
  const delv = parseCostMinor(raw?.delvCost);
  if (price === "bad" || delv === "bad") return { ok: false, reason: `The price or delivery cost for ${productCode} is not an amount like 12.50.` };
  const cbmText = String(raw?.totalCbm ?? "").trim();
  if (cbmText !== "" && !(/^\d+(\.\d+)?$/.test(cbmText) && Number(cbmText) < 100000)) return { ok: false, reason: `The total CBM "${cbmText.slice(0, 20)}" for ${productCode} is not a number.` };
  const expectedDate = parseExpectedDate(raw?.expectedDate);
  if (expectedDate === "bad") return { ok: false, reason: `The expected date "${String(raw.expectedDate).slice(0, 20)}" for ${productCode} must look like 31/12/2026 or 2026-12-31.` };
  const orNull = (v, max) => clean(v, max) || null;
  return {
    ok: true,
    data: {
      sku: orNull(raw?.sku, LIMITS.sku),
      itemVendor,
      containerRange: orNull(raw?.containerRange, LIMITS.containerRange),
      containerNo,
      productName: clean(raw?.productName, LIMITS.productName) || productCode,
      productCode,
      warehouseCode: orNull(raw?.warehouseCode, LIMITS.warehouseCode),
      costDollarMinor: dollar,
      costMinor: dollar === null ? null : Math.round(dollar * DOLLAR_TO_POUND_RATE),
      priceMinor: price,
      delvCostMinor: delv,
      addedQty,
      qty,
      totalCbm: cbmText === "" ? null : Number(cbmText),
      expectedDate,
    },
  };
}

/** The code shown for a container record: the one typed in, or "CON" plus its running number. */
export const containerCodeOf = (row) => row.warehouseCode || `CON${row.seq}`;

const money = (minor) => (minor == null ? "" : (minor / 100).toFixed(2));
export const ukDate = (d) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "");

/** True when the container's goods have not yet arrived (the expected date is after today). */
export const isOnWater = (row, now = new Date()) => Boolean(row.expectedDate) && row.expectedDate.getTime() > now.getTime();

const rowOf = (r) => [r.sku ?? "", r.itemVendor, r.containerNo, r.productName, r.productCode, containerCodeOf(r), money(r.costDollarMinor), money(r.priceMinor), money(r.delvCostMinor), r.addedQty, r.qty, r.totalCbm ?? "", ukDate(r.expectedDate), r.containerRange ?? ""];

/** The container list as a spreadsheet (the same columns as the import). */
export const containerCsv = (rows) => buildCsv(CONTAINER_HEADERS, rows.map(rowOf));

/** A sample to fill in and import: the headings and one example row. */
export const containerSampleCsv = () => buildCsv(CONTAINER_HEADERS, [["EX-SKU-1", "Example Vendor", "1234", "Example Bed 4ft6 Grey", "EX-BED-46-GR", "", "100.00", "250.00", "12.00", 10, 10, "5.5", "31/12/2026", "Example Range"]]);
