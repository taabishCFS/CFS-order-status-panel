// Container stock records and the freight paid per container: list, add, import, correct, delete.
import { allocationsByContainer } from "./container-allocation.server.js";
import { containerCodeOf, isOnWater, normaliseContainer, ukDate } from "./container-stock-rules.js";
import { parseCostMinor } from "./free-stock-rules.js";

export const CONTAINER_PAGE_SIZE = 50;
export const MAX_IMPORT_ROWS = 5000;
export const CONTAINER_VIEWS = ["available", "onWater", "used", "all"];
const CHUNK = 400;
const MAX_REPORTED = 50;
export const MAX_EXPORT_ROWS = 50000;
const money = (minor) => (minor == null ? "" : (minor / 100).toFixed(2));

const shape = (r, allocatedTo = [], now = new Date()) => ({
  id: r.id,
  sku: r.sku ?? "",
  itemVendor: r.itemVendor,
  containerRange: r.containerRange ?? "",
  containerNo: r.containerNo,
  productName: r.productName,
  productCode: r.productCode,
  warehouseCode: containerCodeOf(r),
  costDollar: money(r.costDollarMinor),
  cost: money(r.costMinor),
  price: money(r.priceMinor),
  delvCost: money(r.delvCostMinor),
  addedQty: r.addedQty,
  qty: r.qty,
  totalCbm: r.totalCbm == null ? "" : String(r.totalCbm),
  expectedDate: ukDate(r.expectedDate),
  onWater: isOnWater(r, now),
  addedByName: r.addedByName ?? null,
  allocatedTo,
});

const stamp = (staff) => ({ addedById: staff?.id ?? null, addedByName: staff?.name ?? null });

/** Freight paid, added up: { "<vendor>|<container>": pence }. */
async function freightTotals(db, shop, rows) {
  if (rows.length === 0) return {};
  const found = await db.containerFreight.findMany({ where: { shop, containerNo: { in: [...new Set(rows.map((r) => r.containerNo))] } }, select: { itemVendor: true, containerNo: true, freightMinor: true } });
  const totals = {};
  for (const f of found) totals[`${f.itemVendor}|${f.containerNo}`] = (totals[`${f.itemVendor}|${f.containerNo}`] ?? 0) + f.freightMinor;
  return totals;
}

/**
 * One page of container stock. { search, view: "available" | "onWater" | "used" | "all", page }.
 * Returns { items, total, page, pageCount }. Soonest expected date first, then newest.
 * Each item carries `freight` (pounds paid for its container and vendor, "" when none).
 */
export async function listContainerStock(db, shop, { search = "", view = "available", page = 1 } = {}, now = new Date()) {
  const where = { shop };
  if (view === "available") where.qty = { gt: 0 };
  else if (view === "used") where.qty = { lte: 0 };
  else if (view === "onWater") {
    where.qty = { gt: 0 };
    where.expectedDate = { gt: now };
  }
  const q = String(search).trim().slice(0, 100);
  if (q) where.OR = ["itemVendor", "containerNo", "productName", "productCode", "warehouseCode", "sku", "containerRange"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } }));
  const total = await db.containerStock.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CONTAINER_PAGE_SIZE));
  const at = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), pageCount);
  const rows = await db.containerStock.findMany({ where, orderBy: [{ expectedDate: "asc" }, { createdAt: "desc" }, { id: "asc" }], skip: (at - 1) * CONTAINER_PAGE_SIZE, take: CONTAINER_PAGE_SIZE });
  const [given, freight] = await Promise.all([allocationsByContainer(db, shop, rows.map((r) => r.id)), freightTotals(db, shop, rows)]);
  const items = rows.map((r) => ({ ...shape(r, given[r.id], now), freight: money(freight[`${r.itemVendor}|${r.containerNo}`] ?? null) }));
  return { items, total, page: at, pageCount };
}

/** Every container record for the spreadsheet download. */
export const allContainerStock = (db, shop) => db.containerStock.findMany({ where: { shop }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: MAX_EXPORT_ROWS });

/** Add one record. Returns { ok: true, id } or { ok: false, error: "bad_request", message }. */
export async function addContainerStock(db, shop, input, staff) {
  const row = normaliseContainer(input);
  if (!row.ok) return { ok: false, error: "bad_request", message: row.reason };
  const created = await db.containerStock.create({ data: { shop, ...row.data, ...stamp(staff) }, select: { id: true } });
  return { ok: true, id: created.id };
}

/** Correct a record: every field is replaced by the form's values (quantity 0 marks it used up). */
export async function updateContainerStock(db, shop, id, input) {
  if (typeof id !== "string" || !id) return { ok: false, error: "bad_request", message: "That container item could not be found." };
  const row = normaliseContainer(input, { qtyMin: 0 });
  if (!row.ok) return { ok: false, error: "bad_request", message: row.reason };
  const done = await db.containerStock.updateMany({ where: { id, shop }, data: row.data });
  return done.count > 0 ? { ok: true } : { ok: false, error: "not_found" };
}

/** Delete a record. { ok: true }, { ok: false, error: "not_found" } or { ok: false, error: "allocated" } (given to an order). */
export async function deleteContainerStock(db, shop, id) {
  if (typeof id !== "string" || !id) return { ok: false, error: "not_found" };
  if ((await db.containerAllocation.count({ where: { shop, containerStockId: id } })) > 0) return { ok: false, error: "allocated" };
  try {
    const done = await db.containerStock.deleteMany({ where: { id, shop } });
    return done.count > 0 ? { ok: true } : { ok: false, error: "not_found" };
  } catch (error) {
    if (error?.code === "P2003") return { ok: false, error: "allocated" };
    throw error;
  }
}

/** Import a whole spreadsheet of rows ({ line, ...fields }). Rows not understood are skipped and the rest still go in. */
export async function importContainerStock(db, shop, rows, staff) {
  if (!Array.isArray(rows) || rows.length < 1) return { ok: false, error: "bad_request" };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };
  const rejected = [];
  const data = [];
  for (const raw of rows) {
    const line = Number.isInteger(raw?.line) ? raw.line : null;
    const row = normaliseContainer(raw);
    if (!row.ok) rejected.push({ line, reason: row.reason });
    else data.push({ shop, ...row.data, ...stamp(staff) });
  }
  for (let i = 0; i < data.length; i += CHUNK) await db.containerStock.createMany({ data: data.slice(i, i + CHUNK) });
  return { ok: true, added: data.length, rejected: rejected.slice(0, MAX_REPORTED), rejectedCount: rejected.length };
}

/** Record freight paid for a container from a vendor. Returns { ok: true } or { ok: false, error: "bad_request", message }. */
export async function addContainerFreight(db, shop, { itemVendor, containerNo, freight }, staff) {
  const vendor = String(itemVendor ?? "").trim().slice(0, 200);
  const no = String(containerNo ?? "").trim().slice(0, 60);
  const minor = parseCostMinor(freight);
  if (!vendor || !no) return { ok: false, error: "bad_request", message: "Enter the vendor and the container number." };
  if (minor === "bad" || minor === null || minor < 1) return { ok: false, error: "bad_request", message: "The freight must be an amount above zero, like 850.00." };
  await db.containerFreight.create({ data: { shop, itemVendor: vendor, containerNo: no, freightMinor: minor, ...stamp(staff) } });
  return { ok: true };
}

/** Freight paid per container: [{ itemVendor, containerNo, freight: "850.00", entries }]. */
export async function listContainerFreight(db, shop) {
  const rows = await db.containerFreight.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 2000 });
  const by = new Map();
  for (const r of rows) {
    const k = `${r.itemVendor}|${r.containerNo}`;
    const cur = by.get(k) ?? { itemVendor: r.itemVendor, containerNo: r.containerNo, minor: 0, entries: 0 };
    cur.minor += r.freightMinor;
    cur.entries += 1;
    by.set(k, cur);
  }
  return [...by.values()].map((c) => ({ itemVendor: c.itemVendor, containerNo: c.containerNo, freight: money(c.minor), entries: c.entries }));
}
