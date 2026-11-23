// Credit or pro-forma terms per brand (how the brand's supplier is paid). Read by the payment reports.
import { listBrands } from "./list-query.server.js";

export const TERMS = ["credit", "proforma"];
const MAX_BRAND = 200;

/** [{ brand, terms: "credit" | "proforma" | null }] for every brand that has orders or a saved setting, A to Z. */
export async function listBrandTerms(db, shop) {
  const [brands, saved] = await Promise.all([listBrands(db, shop), db.brandTerms.findMany({ where: { shop } })]);
  const byBrand = new Map(saved.map((s) => [s.brand, s.terms]));
  const names = [...new Set([...brands, ...byBrand.keys()])].sort((a, b) => a.localeCompare(b));
  return names.map((brand) => ({ brand, terms: byBrand.get(brand) ?? null }));
}

/** Set a brand's terms; terms null clears it. Returns { ok: true } or { ok: false, error }. */
export async function saveBrandTerms(db, shop, { brand, terms }, staff) {
  const name = typeof brand === "string" ? brand.trim() : "";
  if (!name || name.length > MAX_BRAND) return { ok: false, error: "bad_request" };
  if (terms !== null && !TERMS.includes(terms)) return { ok: false, error: "bad_request" };
  if (terms === null) {
    await db.brandTerms.deleteMany({ where: { shop, brand: name } });
    return { ok: true };
  }
  const data = { terms, updatedById: staff?.id ?? null, updatedByName: staff?.name ?? null };
  await db.brandTerms.upsert({ where: { shop_brand: { shop, brand: name } }, create: { shop, brand: name, ...data }, update: data });
  return { ok: true };
}

export const MAX_IMPORT_ROWS = 5000;
const CHUNK = 400;
const MAX_REPORTED = 50;

/** What one spreadsheet cell means: "credit", "proforma", "clear" (remove the setting), "skip" (blank: leave the brand alone) or null (not understood). */
export function normaliseTerms(text) {
  const t = String(text ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (t === "") return "skip";
  if (t === "credit") return "credit";
  if (t === "proforma") return "proforma";
  if (t === "clear" || t === "none" || t === "notset") return "clear";
  return null;
}

/**
 * Apply a spreadsheet of { line, brand, terms } rows. Blank terms leave a brand alone; "Clear" removes its setting.
 * Returns { ok: true, saved, cleared, unchanged, rejected: [{ line, reason }] (first 50), rejectedCount } or { ok: false, error }.
 * If a brand appears twice, the last row wins. Rows that are not understood are rejected and the rest still go in.
 */
export async function importBrandTerms(db, shop, rows, staff) {
  if (!Array.isArray(rows) || rows.length < 1) return { ok: false, error: "bad_request" };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };

  const rejected = [];
  const wanted = new Map(); // brand -> "credit" | "proforma" | "clear"
  let unchanged = 0;
  for (const row of rows) {
    const line = Number.isInteger(row?.line) ? row.line : null;
    const brand = typeof row?.brand === "string" ? row.brand.trim() : "";
    if (!brand) { rejected.push({ line, reason: "The brand name is empty." }); continue; }
    if (brand.length > MAX_BRAND) { rejected.push({ line, reason: `The brand name "${brand.slice(0, 30)}..." is too long.` }); continue; }
    const terms = normaliseTerms(row.terms);
    if (terms === null) { rejected.push({ line, reason: `"${String(row.terms).slice(0, 30)}" for ${brand} is not Credit, Pro-forma or Clear.` }); continue; }
    if (terms === "skip") { unchanged += 1; continue; }
    wanted.set(brand, terms);
  }

  const who = { updatedById: staff?.id ?? null, updatedByName: staff?.name ?? null };
  const ops = [...wanted].map(([brand, terms]) =>
    terms === "clear"
      ? db.brandTerms.deleteMany({ where: { shop, brand } })
      : db.brandTerms.upsert({ where: { shop_brand: { shop, brand } }, create: { shop, brand, terms, ...who }, update: { terms, ...who } }),
  );
  for (let i = 0; i < ops.length; i += CHUNK) await db.$transaction(ops.slice(i, i + CHUNK));

  const cleared = [...wanted.values()].filter((t) => t === "clear").length;
  return { ok: true, saved: wanted.size - cleared, cleared, unchanged, rejected: rejected.slice(0, MAX_REPORTED), rejectedCount: rejected.length };
}
