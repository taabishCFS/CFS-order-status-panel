// Free stock records: list, add one, import many. Allocating stock to an order comes in a later step.
import { freeStockRow, normaliseFreeStock } from "./free-stock-rules.js";

export const FREE_STOCK_PAGE_SIZE = 50;
export const MAX_IMPORT_ROWS = 5000;
export const VIEWS = ["available", "used", "all"];
const CHUNK = 400;
const MAX_REPORTED = 50;
export const MAX_EXPORT_ROWS = 50000;

const shape = (r) => {
  const [itemType, sourceOrder, brand, productName, qty, productCode, warehouseCode, rma, remarks, cost, creditFoc, status, collection] = freeStockRow(r);
  return { id: r.id, itemType, sourceOrder, brand, productName, qty, productCode, warehouseCode, rma, remarks, cost, creditFoc, status, collection, addedByName: r.addedByName ?? null, createdAt: r.createdAt };
};

/**
 * One page of the stock list. { search, view: "available" | "used" | "all", itemType, page }.
 * Returns { items, total, page, pageCount, itemTypes }. Newest first.
 */
export async function listFreeStock(db, shop, { search = "", view = "available", itemType = "", page = 1 } = {}) {
  const where = { shop };
  if (view === "available") where.qty = { gt: 0 };
  else if (view === "used") where.qty = { lte: 0 };
  if (itemType) where.itemType = itemType;
  const q = String(search).trim().slice(0, 100);
  if (q) {
    const has = (field) => ({ [field]: { contains: q, mode: "insensitive" } });
    where.OR = ["brand", "productName", "productCode", "sourceOrder", "warehouseCode", "rma", "remarks"].map(has);
  }
  const [total, types] = await Promise.all([
    db.freeStock.count({ where }),
    db.freeStock.findMany({ where: { shop }, distinct: ["itemType"], select: { itemType: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / FREE_STOCK_PAGE_SIZE));
  const at = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), pageCount);
  const rows = await db.freeStock.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (at - 1) * FREE_STOCK_PAGE_SIZE, take: FREE_STOCK_PAGE_SIZE });
  return { items: rows.map(shape), total, page: at, pageCount, itemTypes: types.map((t) => t.itemType).sort() };
}

/** Every stock record for the spreadsheet download, newest first. */
export const allFreeStock = (db, shop) => db.freeStock.findMany({ where: { shop }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: MAX_EXPORT_ROWS });

const stamp = (staff) => ({ addedById: staff?.id ?? null, addedByName: staff?.name ?? null });

/** Add one stock record. Returns { ok: true, id } or { ok: false, error: "bad_request", message }. */
export async function addFreeStock(db, shop, input, staff) {
  const row = normaliseFreeStock(input);
  if (!row.ok) return { ok: false, error: "bad_request", message: row.reason };
  const created = await db.freeStock.create({ data: { shop, ...row.data, ...stamp(staff) }, select: { id: true } });
  return { ok: true, id: created.id };
}

/**
 * Correct a stock record: every field is replaced by the form's values (quantity 0 marks it used up).
 * Returns { ok: true }, { ok: false, error: "bad_request", message } or { ok: false, error: "not_found" }.
 */
export async function updateFreeStock(db, shop, id, input) {
  if (typeof id !== "string" || !id) return { ok: false, error: "bad_request", message: "That stock item could not be found." };
  const row = normaliseFreeStock(input, { minQty: 0 });
  if (!row.ok) return { ok: false, error: "bad_request", message: row.reason };
  const done = await db.freeStock.updateMany({ where: { id, shop }, data: row.data });
  return done.count > 0 ? { ok: true } : { ok: false, error: "not_found" };
}

/** Delete a stock record. Returns { ok: true } or { ok: false, error: "not_found" }. */
export async function deleteFreeStock(db, shop, id) {
  if (typeof id !== "string" || !id) return { ok: false, error: "not_found" };
  const done = await db.freeStock.deleteMany({ where: { id, shop } });
  return done.count > 0 ? { ok: true } : { ok: false, error: "not_found" };
}

/**
 * Add a whole spreadsheet of rows ({ line, ...fields }). Rows that are not understood are skipped and the rest still go in.
 * Importing always adds new records. Returns { ok: true, added, rejected: [{ line, reason }] (first 50), rejectedCount } or { ok: false, error }.
 */
export async function importFreeStock(db, shop, rows, staff) {
  if (!Array.isArray(rows) || rows.length < 1) return { ok: false, error: "bad_request" };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };
  const rejected = [];
  const data = [];
  for (const raw of rows) {
    const line = Number.isInteger(raw?.line) ? raw.line : null;
    const row = normaliseFreeStock(raw);
    if (!row.ok) rejected.push({ line, reason: row.reason });
    else data.push({ shop, ...row.data, ...stamp(staff) });
  }
  for (let i = 0; i < data.length; i += CHUNK) await db.freeStock.createMany({ data: data.slice(i, i + CHUNK) });
  return { ok: true, added: data.length, rejected: rejected.slice(0, MAX_REPORTED), rejectedCount: rejected.length };
}
