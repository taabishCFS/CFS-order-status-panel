// Free stock records: list, add one, import many. Allocating stock to an order comes in a later step.
import { allocationsByStock } from "./free-stock-allocation.server.js";
import { freeStockRow, normaliseFreeStock } from "./free-stock-rules.js";

export const FREE_STOCK_PAGE_SIZE = 50;
export const MAX_IMPORT_ROWS = 5000;
export const VIEWS = ["available", "used", "all"];
export const GROUPS = ["free", "other"]; // "free" is itemType freeStock; "other" is every other type (SBTS and Display)
export const MAX_BULK = 500;
const CHUNK = 400;
const MAX_REPORTED = 50;
export const MAX_EXPORT_ROWS = 50000;

const shape = (r, allocatedTo = []) => {
  const [itemType, sourceOrder, brand, productName, qty, productCode, warehouseCode, rma, remarks, cost, creditFoc, status, collection] = freeStockRow(r);
  return { id: r.id, itemType, sourceOrder, brand, productName, qty, productCode, warehouseCode, rma, remarks, cost, creditFoc, status, collection, addedByName: r.addedByName ?? null, createdAt: r.createdAt, collected: Boolean(r.isCollected), allocatedTo };
};

/**
 * One page of the stock list. { search, view: "available" | "used" | "all", itemType, group: "free" | "other", brand, page }.
 * group "free" lists only free stock; "other" lists the send-back-to-supplier and display types. No group lists everything.
 * Returns { items, total, page, pageCount, itemTypes, brands }. Newest first.
 */
export async function listFreeStock(db, shop, { search = "", view = "available", itemType = "", group = "", brand = "", page = 1 } = {}) {
  const where = { shop };
  const scope = { shop };
  if (group === "free") {
    where.itemType = "freeStock";
    scope.itemType = "freeStock";
  } else if (group === "other") {
    where.itemType = { not: "freeStock" };
    scope.itemType = { not: "freeStock" };
  }
  if (brand) where.brand = String(brand).slice(0, 200);
  if (view === "available") where.qty = { gt: 0 };
  else if (view === "used") where.qty = { lte: 0 };
  // A type filter narrows the list, but never lets the free stock group show other types (or the other group show free stock).
  if (itemType && group !== "free" && !(group === "other" && itemType === "freeStock")) where.itemType = itemType;
  const q = String(search).trim().slice(0, 100);
  if (q) {
    const has = (field) => ({ [field]: { contains: q, mode: "insensitive" } });
    where.OR = ["brand", "productName", "productCode", "sourceOrder", "warehouseCode", "rma", "remarks"].map(has);
  }
  const [total, types, brands] = await Promise.all([
    db.freeStock.count({ where }),
    db.freeStock.findMany({ where: scope, distinct: ["itemType"], select: { itemType: true } }),
    db.freeStock.findMany({ where: scope, distinct: ["brand"], select: { brand: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / FREE_STOCK_PAGE_SIZE));
  const at = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), pageCount);
  const rows = await db.freeStock.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (at - 1) * FREE_STOCK_PAGE_SIZE, take: FREE_STOCK_PAGE_SIZE });
  const given = await allocationsByStock(db, shop, rows.map((r) => r.id));
  return { items: rows.map((r) => shape(r, given[r.id])), total, page: at, pageCount, itemTypes: types.map((t) => t.itemType).sort(), brands: (brands ?? []).map((b) => b.brand).sort((a, b) => a.localeCompare(b)) };
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

/**
 * Delete a stock record. Returns { ok: true }, { ok: false, error: "not_found" } or { ok: false, error: "allocated" }
 * (it has been given to an order: take those allocations back first).
 */
export async function deleteFreeStock(db, shop, id) {
  if (typeof id !== "string" || !id) return { ok: false, error: "not_found" };
  if ((await db.freeStockAllocation.count({ where: { shop, freeStockId: id } })) > 0) return { ok: false, error: "allocated" };
  try {
    const done = await db.freeStock.deleteMany({ where: { id, shop } });
    return done.count > 0 ? { ok: true } : { ok: false, error: "not_found" };
  } catch (error) {
    if (error?.code === "P2003") return { ok: false, error: "allocated" }; // given out a moment ago: the database refuses
    throw error;
  }
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

const cleanIds = (ids) => (Array.isArray(ids) ? [...new Set(ids.filter((i) => typeof i === "string" && i))].slice(0, MAX_BULK) : []);

/** Mark items collected (or put them back as not collected). Returns { ok: true, changed } or { ok: false, error: "bad_request" }. */
export async function markCollected(db, shop, ids, collected) {
  const list = cleanIds(ids);
  if (list.length === 0 || typeof collected !== "boolean") return { ok: false, error: "bad_request" };
  const done = await db.freeStock.updateMany({ where: { shop, id: { in: list } }, data: { isCollected: collected } });
  return { ok: true, changed: done.count };
}

/**
 * Remove several items at once. Items given to an order are kept (take the allocation back first).
 * Returns { ok: true, removed, kept } or { ok: false, error: "bad_request" }.
 */
export async function removeFreeStockMany(db, shop, ids) {
  const list = cleanIds(ids);
  if (list.length === 0) return { ok: false, error: "bad_request" };
  let removed = 0;
  let kept = 0;
  for (const id of list) {
    const done = await deleteFreeStock(db, shop, id);
    if (done.ok) removed += 1;
    else if (done.error === "allocated") kept += 1;
  }
  return { ok: true, removed, kept };
}

/** The send-back-to-supplier and display records (every type except free stock) for the spreadsheet download. */
export const allOtherStock = (db, shop) => db.freeStock.findMany({ where: { shop, itemType: { not: "freeStock" } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: MAX_EXPORT_ROWS });
