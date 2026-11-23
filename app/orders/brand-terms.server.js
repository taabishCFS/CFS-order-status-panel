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
