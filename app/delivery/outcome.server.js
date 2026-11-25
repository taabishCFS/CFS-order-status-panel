// The Completed Delivery and Failed Delivery/Collection lists: order lines in those statuses, with their booking.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { listFleet } from "./delivery.server.js";
import { deliveryTypeOf } from "./bulk-delivery-rules.js";
import { ALL_SIZE, KINDS, PAGE_SIZE, matchesOutcomeSearch, partnerOf } from "./outcome-rules.js";

const OWN = "CFS";
const label = new Map(statuses.map((s) => [s.id, s.label]));
const brandOf = (vendor) => vendor?.trim() || "Unmapped";

/** Every matching row, newest delivery first: [{ lineId, ..., date, van, driver, reason, payMode, amountMinor }]. */
export async function outcomeRows(db, shop, params) {
  const lines = await db.orderLine.findMany({ where: { shop, lineStatusId: { in: KINDS[params.kind].statuses } } });
  if (lines.length === 0) return [];
  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const [orders, bookings, allLines, history, fleet] = await Promise.all([
    db.order.findMany({ where: { shop, orderId: { in: orderIds } } }),
    db.deliveryBooking.findMany({ where: { shop, orderId: { in: orderIds } } }),
    db.orderLine.findMany({ where: { shop, orderId: { in: orderIds } } }),
    params.kind === "failed" ? db.deliveryHistory.findMany({ where: { shop, orderId: { in: orderIds } } }) : [],
    listFleet(db, shop),
  ]);
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const bookingOf = new Map(bookings.map((b) => [b.lineId, b]));
  const vanOf = new Map(fleet.vans.map((v) => [v.id, v]));
  const driverOf = new Map(fleet.drivers.map((d) => [d.id, d]));
  const titles = new Map();
  for (const l of allLines) titles.set(l.orderId, [...(titles.get(l.orderId) ?? []), l.title]);
  const reasonOf = new Map();
  for (const h of [...history].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) if (h.reason) reasonOf.set(h.lineId, h.reason);

  const wantPartner = partnerOf(params.van);
  const rows = [];
  for (const l of lines) {
    const o = orderOf.get(l.orderId);
    if (!o || !matchesOutcomeSearch(params.q, o)) continue;
    if (params.brand && brandOf(l.vendor) !== params.brand) continue;
    if (params.pay && (o.gateway ?? "") !== params.pay) continue;
    const b = bookingOf.get(l.lineId);
    const partner = b ? b.partner : null;
    if (wantPartner) {
      if (partner !== wantPartner) continue;
    } else {
      if (params.van && !(partner === OWN && b.vanId === params.van)) continue;
      if ((params.from || params.to) && !(b?.date && (!params.from || b.date >= params.from) && (!params.to || b.date <= params.to))) continue;
    }
    const van = !b ? "" : partner !== OWN ? partner : vanOf.get(b.vanId)?.name ?? "";
    const driver = b && partner === OWN ? driverOf.get(b.driverId ?? vanOf.get(b.vanId)?.driverId)?.name ?? "" : "";
    rows.push({
      lineId: l.lineId, orderId: l.orderId, orderName: o.name, orderDate: o.createdAt.toISOString(), email: o.email ?? "",
      brand: brandOf(l.vendor), product: l.title, code: l.sku ?? "", quantity: l.quantity,
      date: b?.date ?? null, van, driver, reason: reasonOf.get(l.lineId) ?? "",
      postcode: o.postcode ?? "", deliveryType: deliveryTypeOf(titles.get(l.orderId) ?? []),
      payMode: o.gateway ?? "", amountMinor: Math.max(0, (l.priceMinor ?? 0) * (l.quantity ?? 1) - (l.discountMinor ?? 0)),
      lineStatusId: l.lineStatusId, statusLabel: label.get(l.lineStatusId) ?? "",
    });
  }
  return rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.orderDate.localeCompare(a.orderDate) || a.orderName.localeCompare(b.orderName) || a.lineId.localeCompare(b.lineId));
}

/** One page: { rows, total, page, pageCount, size, vans, payModes }. */
export async function listOutcome(db, shop, params) {
  const rows = await outcomeRows(db, shop, params);
  const size = params.all ? ALL_SIZE : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(params.page, pageCount);
  const fleet = await listFleet(db, shop);
  const gateways = await db.order.findMany({ where: { shop }, distinct: ["gateway"], select: { gateway: true } });
  return {
    rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageCount, size,
    vans: fleet.vans.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name })),
    payModes: [...new Set(gateways.map((g) => g.gateway).filter(Boolean))].sort(),
  };
}
