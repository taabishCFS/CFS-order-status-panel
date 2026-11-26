// The Carrier Deliveries lists: order lines for one carrier (or White Glove, DHD, or allocated and booked), with their booking.
import { listFleet } from "./delivery.server.js";
import { deliveryTypeOf } from "./bulk-delivery-rules.js";
import { orderIsWhiteGlove } from "./maxpro-rules.js";
import { ALL_SIZE, CARRIERS, PAGE_SIZE, matchesCarrierSearch, statusWanted } from "./carrier-rules.js";

const OWN = "CFS";
const brandOf = (vendor) => vendor?.trim() || "Unmapped";

/** Every matching row, newest order first. */
export async function carrierRows(db, shop, params) {
  const cfg = CARRIERS[params.key];
  let lines;
  let bookings;
  if (cfg.partner || cfg.booked) {
    bookings = (await db.deliveryBooking.findMany({ where: { shop, ...(cfg.partner ? { partner: cfg.partner } : { partner: OWN }) } })).filter((b) => (cfg.booked ? b.vanId && b.date && !b.prebook : true));
    lines = bookings.length ? await db.orderLine.findMany({ where: { shop, lineId: { in: bookings.map((b) => b.lineId) } } }) : [];
  } else {
    lines = await db.orderLine.findMany({ where: { shop, lineStatusId: { in: cfg.statuses } } });
  }
  lines = lines.filter((l) => statusWanted(cfg, l.lineStatusId));
  if (lines.length === 0) return [];

  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const [orders, allBookings, chases, fleet, siblings] = await Promise.all([
    db.order.findMany({ where: { shop, orderId: { in: orderIds } } }),
    bookings ?? db.deliveryBooking.findMany({ where: { shop, orderId: { in: orderIds } } }),
    db.lineChase.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) } } }),
    listFleet(db, shop),
    cfg.whiteGlove || cfg.booked ? db.orderLine.findMany({ where: { shop, orderId: { in: orderIds } } }) : [],
  ]);
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const bookingOf = new Map(allBookings.map((b) => [b.lineId, b]));
  const chaseOf = new Map(chases.map((c) => [c.lineId, c.lastChasedAt]));
  const vanOf = new Map(fleet.vans.map((v) => [v.id, v]));
  const driverOf = new Map(fleet.drivers.map((d) => [d.id, d.name]));
  const titles = new Map();
  for (const l of siblings) titles.set(l.orderId, [...(titles.get(l.orderId) ?? []), l.title]);

  const rows = [];
  for (const l of lines) {
    const o = orderOf.get(l.orderId);
    if (!o || o.cancelledAt || !matchesCarrierSearch(params.q, o)) continue;
    if (cfg.whiteGlove && !orderIsWhiteGlove(titles.get(l.orderId) ?? [])) continue;
    if (params.brand && brandOf(l.vendor) !== params.brand) continue;
    const b = bookingOf.get(l.lineId);
    if (params.van && !(b?.partner === OWN && b.vanId === params.van)) continue;
    if ((params.from || params.to) && !(b?.date && (!params.from || b.date >= params.from) && (!params.to || b.date <= params.to))) continue;
    rows.push({
      lineId: l.lineId, orderId: l.orderId, orderName: o.name, orderDate: o.createdAt.toISOString(), email: o.email ?? "",
      brand: brandOf(l.vendor), postcode: o.postcode ?? "", product: l.title, code: l.sku ?? "", quantity: l.quantity,
      custDate: b?.date ?? l.expectedDate ?? null, expectedDate: l.expectedDate ?? null, lastChaseDate: chaseOf.get(l.lineId)?.toISOString?.() ?? null,
      date: b?.date ?? null, van: b?.partner === OWN ? vanOf.get(b.vanId)?.name ?? "" : "",
      driver: b?.partner === OWN ? driverOf.get(b.driverId ?? vanOf.get(b.vanId)?.driverId) ?? "" : "", drop: b?.partner === OWN ? b.drop ?? null : null,
      slot: b?.amPm === "AM" || b?.amPm === "PM" ? b.amPm : "", size: l.variantTitle ?? "", deliveryType: cfg.booked ? deliveryTypeOf(titles.get(l.orderId) ?? []) : "", confirmed: l.deliveryOutcome ?? null, emailed: Boolean(b?.emailed),
      lineStatusId: l.lineStatusId, amountMinor: Math.max(0, (l.priceMinor ?? 0) * (l.quantity ?? 1) - (l.discountMinor ?? 0)),
    });
  }
  return rows.sort((a, b) => b.orderDate.localeCompare(a.orderDate) || a.orderName.localeCompare(b.orderName) || a.lineId.localeCompare(b.lineId));
}

/** One page: { rows, total, page, pageCount, size, vans }. */
export async function listCarrier(db, shop, params) {
  const rows = await carrierRows(db, shop, params);
  const size = params.all ? ALL_SIZE : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(params.page, pageCount);
  const fleet = await listFleet(db, shop);
  return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageCount, size, vans: fleet.vans.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name })) };
}
