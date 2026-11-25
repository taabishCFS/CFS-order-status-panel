// The Delivery Booked page (legacy "Delivery Booking History"): bookings grouped into runs (one day, one van, one driver),
// changing drops, and the data behind the exports.
import { listFleet } from "./delivery.server.js";
import { placeOnVan } from "./drop-shift.server.js";
import { deliveryTypeOf, keywordIndex, splitKeywords } from "./bulk-delivery-rules.js";

const OWN = "CFS";
const brandOf = (vendor) => vendor?.trim() || "Unmapped";

/**
 * Runs for the date range: { runs: [{ key, date, vanId, vanName, driverName, rows, totalMinor, currency }], summary: { runs, entries } }.
 * params: { from, to (YYYY-MM-DD), brand, q (order numbers or postcodes, comma separated) }.
 * Pre-booked lines (a provisional date, no van) are not listed.
 */
export async function listBooked(db, shop, params) {
  const bookings = await db.deliveryBooking.findMany({ where: { shop, partner: OWN, prebook: false } });
  const inRange = bookings.filter((b) => b.vanId && b.date && b.date >= params.from && b.date <= params.to);
  if (inRange.length === 0) return { runs: [], summary: { runs: 0, entries: 0 } };

  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: inRange.map((b) => b.lineId) } } });
  const lineOf = new Map(lines.map((l) => [l.lineId, l]));
  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const orders = await db.order.findMany({ where: { shop, orderId: { in: orderIds } } });
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const all = await db.orderLine.findMany({ where: { shop, orderId: { in: orderIds } } });
  const titles = new Map();
  for (const l of all) titles.set(l.orderId, [...(titles.get(l.orderId) ?? []), l.title]);
  const fleet = await listFleet(db, shop);
  const vanOf = new Map(fleet.vans.map((v) => [v.id, v]));
  const driverOf = new Map(fleet.drivers.map((d) => [d.id, d]));
  const keywords = splitKeywords(params.q);

  const runs = new Map();
  for (const b of inRange) {
    const l = lineOf.get(b.lineId);
    const o = l && orderOf.get(l.orderId);
    if (!l || !o) continue;
    if (params.brand && brandOf(l.vendor) !== params.brand) continue;
    if (keywords.length && keywordIndex(keywords, o) < 0) continue;
    const key = `${b.date}|${b.vanId}`;
    if (!runs.has(key)) {
      const van = vanOf.get(b.vanId);
      const driver = driverOf.get(b.driverId ?? van?.driverId);
      runs.set(key, { key, date: b.date, vanId: b.vanId, vanName: van?.name ?? "Van", driverName: driver?.name ?? "", rows: [], totalMinor: 0, currency: l.currency ?? "GBP" });
    }
    const run = runs.get(key);
    const amountMinor = Math.max(0, (l.priceMinor ?? 0) * (l.quantity ?? 1) - (l.discountMinor ?? 0));
    run.totalMinor += amountMinor;
    run.rows.push({
      lineId: l.lineId,
      orderId: l.orderId,
      orderName: o.name,
      orderDate: o.createdAt.toISOString(),
      brand: brandOf(l.vendor),
      product: l.title,
      code: l.sku ?? "",
      size: l.variantTitle ?? "",
      quantity: l.quantity,
      box: null,
      delivery: l.deliveryOutcome === "confirmed" || l.deliveryOutcome === "declined" ? l.deliveryOutcome : null,
      lineStatusId: l.lineStatusId,
      amPm: b.amPm === "AM" || b.amPm === "PM" ? b.amPm : "",
      drop: b.drop,
      deliveryType: deliveryTypeOf(titles.get(l.orderId) ?? []),
      postcode: o.postcode ?? "",
      amountMinor,
      emailed: Boolean(b.emailed),
    });
  }
  const list = [...runs.values()].sort((a, b) => a.date.localeCompare(b.date) || a.vanName.localeCompare(b.vanName));
  for (const run of list) run.rows.sort((a, b) => (a.drop ?? 999) - (b.drop ?? 999) || a.orderName.localeCompare(b.orderName) || a.lineId.localeCompare(b.lineId));
  return { runs: list, summary: { runs: list.length, entries: list.reduce((n, r) => n + r.rows.length, 0) } };
}

/** New Drop save for one run: the typed drops are kept and any order in the way moves down. request: { date, vanId, rows: [{ lineId, drop }] }. */
export async function saveDrops(db, { shop, request, actor }) {
  const bookings = await db.deliveryBooking.findMany({ where: { shop, date: request.date, vanId: request.vanId, partner: OWN, prebook: false } });
  const orderOf = new Map(bookings.map((b) => [b.lineId, b.orderId]));
  const pinned = new Map();
  for (const r of request.rows) {
    const orderId = orderOf.get(r.lineId);
    if (!orderId) return { ok: false, code: "no_lines" };
    pinned.set(orderId, r.drop);
  }
  const placed = await placeOnVan(db, { shop, date: request.date, vanId: request.vanId, pinned, actor, apply: true });
  if (!placed.ok) return placed;
  return { ok: true, saved: pinned.size, moved: placed.moved };
}

/** Keeps only the ticked lines in each run (and drops runs left empty), with the totals worked out again. */
export function onlyLines(runs, lineIds) {
  const keep = new Set(lineIds);
  return runs
    .map((run) => {
      const rows = run.rows.filter((r) => keep.has(r.lineId));
      return { ...run, rows, totalMinor: rows.reduce((n, r) => n + r.amountMinor, 0) };
    })
    .filter((run) => run.rows.length > 0);
}
