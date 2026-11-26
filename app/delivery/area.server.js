// Delivery areas (legacy "Area"): a name plus the postcode beginnings it covers.
export const PAGE_SIZE = 50;

/** "ne, DH ,,sr" -> "NE, DH, SR" (upper case, trimmed, no blanks or repeats). */
export function cleanPostcodes(text) {
  const parts = String(text ?? "").split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
  return [...new Set(parts)].join(", ");
}

/** Reads a POST body: op add | update | status | delete. Returns { value } or { error }. */
export function readAreaInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const ids = () => (Array.isArray(body.ids) ? [...new Set(body.ids.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80))].slice(0, 500) : []);
  if (body.op === "add" || body.op === "update") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) return { error: "no_name" };
    const postcodes = cleanPostcodes(body.postcodes).slice(0, 2000);
    const active = body.active !== false;
    if (body.op === "update") {
      if (typeof body.id !== "string" || !body.id) return { error: "bad_request" };
      return { value: { op: "update", id: body.id, name, postcodes, active } };
    }
    return { value: { op: "add", name, postcodes, active } };
  }
  if (body.op === "status") {
    if (typeof body.active !== "boolean") return { error: "bad_request" };
    const list = ids();
    return list.length ? { value: { op: "status", ids: list, active: body.active } } : { error: "nothing_selected" };
  }
  if (body.op === "delete") {
    const list = ids();
    return list.length ? { value: { op: "delete", ids: list } } : { error: "nothing_selected" };
  }
  return { error: "bad_request" };
}

/** One page in ID order: { rows: [{ id, number, name, postcodes, active }], total, page, pageCount }. */
export async function listAreas(db, shop, pageParam = 1) {
  const all = (await db.area.findMany({ where: { shop } })).sort((a, b) => a.seq - b.seq);
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pageCount);
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((a) => ({ id: a.id, number: a.seq, name: a.name, postcodes: a.postcodes ?? "", active: a.active }));
  return { rows, total, page, pageCount };
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Returns { ok: true } or { ok: false, code: "duplicate" | "not_found" }. */
export async function saveArea(db, shop, input) {
  const all = await db.area.findMany({ where: { shop } });
  if (input.op === "add") {
    if (all.some((a) => sameName(a.name, input.name))) return { ok: false, code: "duplicate" };
    const seq = all.reduce((m, a) => Math.max(m, a.seq), 0) + 1;
    await db.area.create({ data: { shop, seq, name: input.name, postcodes: input.postcodes, active: input.active } });
    return { ok: true };
  }
  const current = all.find((a) => a.id === input.id);
  if (!current) return { ok: false, code: "not_found" };
  if (all.some((a) => a.id !== input.id && sameName(a.name, input.name))) return { ok: false, code: "duplicate" };
  await db.area.update({ where: { id: input.id }, data: { name: input.name, postcodes: input.postcodes, active: input.active } });
  return { ok: true };
}

export async function setAreasActive(db, shop, ids, active) {
  const res = await db.area.updateMany({ where: { shop, id: { in: ids } }, data: { active } });
  return { ok: true, changed: res.count };
}

export async function deleteAreas(db, shop, ids) {
  const res = await db.area.deleteMany({ where: { shop, id: { in: ids } } });
  return { ok: true, deleted: res.count };
}
