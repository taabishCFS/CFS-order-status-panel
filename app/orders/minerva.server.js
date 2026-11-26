// Minerva Supplier Orders (legacy minerva_order): some brands ("Minerva suppliers") give a discount on what we pay them between two dates.
// When a line of such a brand is marked Paid, its paid amount is recorded with the brand's discount and dates; the report adds the
// payments up per brand, split into those paid inside the dates (Applicable) and outside them (Not Applicable).
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const day = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD, UK date

/** Reads { op: "save", brand, disc, from, to } or { op: "delete", brand }. disc is a percentage such as "2.5". */
export function readMinervaInput(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 200) : "";
  if (!brand) return { error: "brand_required", message: "Choose a brand." };
  if (body.op === "delete") return { value: { op: "delete", brand } };
  if (body.op !== "save") return { error: "bad_request" };
  const disc = String(body.disc ?? "").replace(/[%\s]/g, "");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(disc) || Number(disc) <= 0 || Number(disc) > 50) return { error: "bad_disc", message: "Type the Minerva discount as a percentage between 0.01 and 50." };
  if (!validDate(body.from) || !validDate(body.to)) return { error: "bad_date", message: "Choose the From and To dates." };
  if (body.from > body.to) return { error: "bad_date", message: "The From date must be on or before the To date." };
  return { value: { op: "save", brand, discHundredths: Math.round(Number(disc) * 100), fromDate: body.from, toDate: body.to } };
}

export async function saveMinervaBrand(db, shop, v, staff) {
  if (v.op === "delete") {
    const { count } = await db.minervaBrand.deleteMany({ where: { shop, brand: v.brand } });
    return { ok: true, removed: count };
  }
  const data = { discHundredths: v.discHundredths, fromDate: v.fromDate, toDate: v.toDate, updatedByName: staff?.name ?? null };
  await db.minervaBrand.upsert({ where: { shop_brand: { shop, brand: v.brand } }, create: { shop, brand: v.brand, ...data }, update: data });
  return { ok: true };
}

/** The Minerva brands, plus every brand name we have orders for (to choose from). */
export async function listMinervaBrands(db, shop) {
  const [brands, vendors] = await Promise.all([
    db.minervaBrand.findMany({ where: { shop }, orderBy: { brand: "asc" } }),
    db.orderLine.findMany({ where: { shop, vendor: { not: null } }, distinct: ["vendor"], select: { vendor: true }, take: 5000 }),
  ]);
  return {
    brands: brands.map((b) => ({ brand: b.brand, discHundredths: b.discHundredths, fromDate: b.fromDate, toDate: b.toDate, updatedByName: b.updatedByName })),
    allBrands: [...new Set(vendors.map((v) => v.vendor.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  };
}

/** Called when lines are marked Paid or Not Paid: records (or removes) the Minerva payment of lines whose brand is a Minerva supplier.
 *  The paid amount is the manual cost typed for the line, as in the old app. */
export async function recordMinervaPayments(db, shop, lines, paid, now = new Date()) {
  const ids = lines.map((l) => l.lineId);
  if (ids.length === 0) return 0;
  if (!paid) {
    const { count } = await db.minervaPayment.deleteMany({ where: { shop, lineId: { in: ids } } });
    return count;
  }
  const minerva = new Map((await db.minervaBrand.findMany({ where: { shop } })).map((b) => [b.brand, b]));
  const due = lines.filter((l) => minerva.has((l.vendor ?? "").trim()));
  if (due.length === 0) return 0;
  const costs = new Map((await db.linePayment.findMany({ where: { shop, lineId: { in: due.map((l) => l.lineId) } } })).map((p) => [p.lineId, p.manualCostMinor ?? 0]));
  for (const l of due) {
    const b = minerva.get(l.vendor.trim());
    const data = { orderId: l.orderId, brand: b.brand, discHundredths: b.discHundredths, fromDate: b.fromDate, toDate: b.toDate, paidMinor: costs.get(l.lineId) ?? 0, paidAt: now };
    await db.minervaPayment.upsert({ where: { shop_lineId: { shop, lineId: l.lineId } }, create: { shop, lineId: l.lineId, ...data }, update: data });
  }
  return due.length;
}

/** Reads ?from=&to= (the paid date). */
export function parseMinervaParams(searchParams) {
  let from = validDate(searchParams.get("from")) ? searchParams.get("from") : "";
  let to = validDate(searchParams.get("to")) ? searchParams.get("to") : "";
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to };
}

/** One row per brand: applicable / not applicable paid amounts, the discount and the two discount amounts (all in pence). */
export async function minervaReport(db, shop, { from, to }) {
  const paidAt = {};
  if (from) paidAt.gte = new Date(`${from}T00:00:00Z`);
  if (to) paidAt.lte = new Date(`${to}T23:59:59.999Z`);
  const where = { shop };
  if (from || to) where.paidAt = paidAt;
  const payments = await db.minervaPayment.findMany({ where, orderBy: { paidAt: "asc" } });
  const byBrand = new Map();
  for (const p of payments) {
    const r = byBrand.get(p.brand) ?? { brand: p.brand, applicableMinor: 0, notApplicableMinor: 0, discHundredths: p.discHundredths, lines: 0 };
    const d = day(p.paidAt);
    if (d >= p.fromDate && d <= p.toDate) r.applicableMinor += p.paidMinor;
    else r.notApplicableMinor += p.paidMinor;
    r.lines += 1;
    byBrand.set(p.brand, r);
  }
  const rows = [...byBrand.values()]
    .map((r) => ({ ...r, amountMinor: Math.round((r.applicableMinor * r.discHundredths) / 10000), notEligibleMinor: Math.round((r.notApplicableMinor * r.discHundredths) / 10000) }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
  return { rows };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (m) => (m / 100).toFixed(2);
export const discText = (h) => String(h / 100);

/** The old minerva_report.csv (the old Brand Id column is left out: brands have no number here). */
export function minervaCsv(rows) {
  const head = "Brand,Order Amount,Not Applicable Order Amount,Discount,Amount,Amount Not Eligible";
  const body = rows.map((r) => [r.brand, money(r.applicableMinor), money(r.notApplicableMinor), discText(r.discHundredths), money(r.amountMinor), money(r.notEligibleMinor)].map(cell).join(","));
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}
