// Keeps the drops of one van and day in order: when an order takes a drop, the order that had it (and any after it that
// would collide) moves down one place, and the move is logged. Used by booking (one order or many) and by the New Drop save.
import { placeDrops } from "./booked-delivery-rules.js";

const OWN = "CFS";

/**
 * pinned: Map orderId -> the drop it must have on this van and day. Their bookings must already exist unless `apply` is true,
 * in which case the pinned drops are written here too. Returns { ok: true, moved } (moved = other orders that moved) or { ok: false, code }.
 */
export async function placeOnVan(db, { shop, date, vanId, pinned, actor, apply = false }) {
  const bookings = await db.deliveryBooking.findMany({ where: { shop, date, vanId, partner: OWN, prebook: false } });
  const current = new Map();
  for (const b of bookings) if (!current.has(b.orderId) || current.get(b.orderId) === null) current.set(b.orderId, b.drop);
  const placed = placeDrops(current, pinned);
  if (!placed.ok) return placed;

  const names = (await db.van.findFirst({ where: { shop, id: vanId } }))?.name ?? null;
  let moved = 0;
  for (const [orderId, drop] of placed.drops) {
    if (current.get(orderId) === drop) continue;
    if (pinned.has(orderId) && !apply) continue;
    const rows = bookings.filter((b) => b.orderId === orderId);
    await db.deliveryBooking.updateMany({ where: { shop, orderId, date, vanId, partner: OWN, prebook: false }, data: { drop } });
    for (const b of rows) {
      await db.deliveryHistory.create({
        data: { shop, orderId, lineId: b.lineId, action: "moved", partner: OWN, date, vanName: names, driverName: null, drop, amPm: b.amPm, reason: b.drop === null ? null : `Drop ${b.drop} to ${drop}`, actorName: actor.name },
      });
    }
    if (!pinned.has(orderId)) moved += 1;
  }
  return { ok: true, moved };
}
