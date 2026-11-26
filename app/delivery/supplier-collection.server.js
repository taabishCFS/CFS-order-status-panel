// The Supplier Collection list (legacy "Supplier Collection"): a planned pick-up from one supplier brand by one van on one day.
import { listFleet } from "./delivery.server.js";

export const PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const brandOf = (vendor) => vendor?.trim() || "Unmapped";

/** Reads a POST body: { op: "add", brand, vanId, date } or { op: "delete", ids }. Returns { value } or { error }. */
export function readCollectionInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  if (body.op === "add") {
    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const vanId = typeof body.vanId === "string" ? body.vanId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    if (!brand || brand.length > 200) return { error: "no_brand" };
    if (!vanId || vanId.length > 80) return { error: "no_van" };
    if (!DATE.test(date) || Number.isNaN(Date.parse(date))) return { error: "no_date" };
    return { value: { op: "add", brand, vanId, date } };
  }
  if (body.op === "delete") {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80))].slice(0, 500) : [];
    if (ids.length === 0) return { error: "nothing_selected" };
    return { value: { op: "delete", ids } };
  }
  return { error: "bad_request" };
}

/** One page, newest first: { rows: [{ id, number, brand, address, van, date }], total, page, pageCount, brands, vans }. */
export async function listCollections(db, shop, pageParam = 1) {
  const [all, contacts, fleet, vendors] = await Promise.all([
    db.supplierCollection.findMany({ where: { shop } }),
    db.supplierContact.findMany({ where: { shop } }),
    listFleet(db, shop),
    db.orderLine.findMany({ where: { shop }, distinct: ["vendor"], select: { vendor: true } }),
  ]);
  const addressOf = new Map(contacts.map((c) => [c.brand, c.address ?? ""]));
  const vanOf = new Map(fleet.vans.map((v) => [v.id, v.name]));
  const sorted = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id));
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pageCount);
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c, i) => ({
    id: c.id, number: total - (page - 1) * PAGE_SIZE - i, brand: c.brand, address: addressOf.get(c.brand) ?? "", van: vanOf.get(c.vanId) ?? "", date: c.date,
  }));
  const brands = [...new Set([...vendors.map((v) => brandOf(v.vendor)), ...contacts.map((c) => c.brand)])].sort((a, b) => a.localeCompare(b));
  return { rows, total, page, pageCount, brands, vans: fleet.vans.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name })) };
}

/** Adds one collection. { ok: true } or { ok: false, code: "no_van" | "duplicate" }. */
export async function addCollection(db, shop, input, actor) {
  const fleet = await listFleet(db, shop);
  if (!fleet.vans.some((v) => v.id === input.vanId && v.active)) return { ok: false, code: "no_van" };
  const dup = await db.supplierCollection.findFirst({ where: { shop, brand: input.brand, vanId: input.vanId, date: input.date } });
  if (dup) return { ok: false, code: "duplicate" };
  await db.supplierCollection.create({ data: { shop, brand: input.brand, vanId: input.vanId, date: input.date, createdByName: actor?.name ?? "" } });
  return { ok: true };
}

/** Deletes the ticked collections. Returns { ok: true, deleted }. */
export async function deleteCollections(db, shop, ids) {
  const res = await db.supplierCollection.deleteMany({ where: { shop, id: { in: ids } } });
  return { ok: true, deleted: res.count };
}
