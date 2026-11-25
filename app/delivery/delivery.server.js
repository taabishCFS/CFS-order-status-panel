import { LIVE_STATUSES, pmFollowers } from "./delivery-rules.js";

const MODEL = { driver: "driver", van: "van", slot: "deliverySlot" };
const NAME_FIELD = { driver: "name", van: "name", slot: "label" };
const EXTRA_FIELD = { driver: "phone", van: "reg", slot: null };

/** The three fleet lists, active ones first. */
export async function listFleet(db, shop) {
  const order = [{ active: "desc" }];
  const [drivers, vans, slots] = await Promise.all([
    db.driver.findMany({ where: { shop }, orderBy: [...order, { name: "asc" }] }),
    db.van.findMany({ where: { shop }, orderBy: [...order, { name: "asc" }] }),
    db.deliverySlot.findMany({ where: { shop }, orderBy: [...order, { label: "asc" }] }),
  ]);
  return {
    drivers: drivers.map((d) => ({ id: d.id, name: d.name, extra: d.phone ?? "", active: d.active })),
    vans: vans.map((v) => ({ id: v.id, name: v.name, extra: v.reg ?? "", active: v.active })),
    slots: slots.map((s) => ({ id: s.id, name: s.label, extra: "", active: s.active })),
  };
}

/** Add, rename, deactivate or restore one driver, van or slot. Items are never deleted, so history keeps its names. */
export async function saveFleetItem(db, shop, input) {
  const model = db[MODEL[input.kind]];
  const nameField = NAME_FIELD[input.kind];
  const extraField = EXTRA_FIELD[input.kind];
  if (input.op === "add" || input.op === "rename") {
    const clash = await model.findFirst({ where: { shop, [nameField]: input.name, ...(input.op === "rename" ? { id: { not: input.id } } : {}) } });
    if (clash) return { ok: false, code: "duplicate_name" };
    const data = { [nameField]: input.name, ...(extraField ? { [extraField]: input.extra || null } : {}) };
    if (input.op === "add") return { ok: true, item: await model.create({ data: { shop, ...data } }) };
    const found = await model.findFirst({ where: { shop, id: input.id } });
    if (!found) return { ok: false, code: "not_found" };
    return { ok: true, item: await model.update({ where: { id: input.id }, data }) };
  }
  const found = await model.findFirst({ where: { shop, id: input.id } });
  if (!found) return { ok: false, code: "not_found" };
  await model.update({ where: { id: input.id }, data: { active: input.op === "restore" } });
  return { ok: true };
}

const bookingView = (b, names) => ({
  lineId: b.lineId,
  date: b.date,
  vanId: b.vanId,
  vanName: b.vanId ? names.vans.get(b.vanId) ?? "" : "",
  driverId: b.driverId,
  driverName: b.driverId ? names.drivers.get(b.driverId) ?? "" : "",
  slotId: b.slotId,
  slotName: b.slotId ? names.slots.get(b.slotId) ?? "" : "",
  drop: b.drop,
  amPm: b.amPm,
  bookedByName: b.bookedByName,
});

async function nameMaps(db, shop) {
  const fleet = await listFleet(db, shop);
  const map = (list) => new Map(list.map((i) => [i.id, i.name]));
  return { fleet, names: { drivers: map(fleet.drivers), vans: map(fleet.vans), slots: map(fleet.slots) } };
}

/** An order's bookings and history, plus the fleet lists for the booking box. */
export async function orderDelivery(db, shop, orderId) {
  const { fleet, names } = await nameMaps(db, shop);
  const [bookings, history] = await Promise.all([
    db.deliveryBooking.findMany({ where: { shop, orderId } }),
    db.deliveryHistory.findMany({ where: { shop, orderId }, orderBy: [{ createdAt: "desc" }], take: 100 }),
  ]);
  return {
    fleet: { drivers: fleet.drivers.filter((d) => d.active), vans: fleet.vans.filter((v) => v.active), slots: fleet.slots.filter((s) => s.active) },
    bookings: bookings.map((b) => bookingView(b, names)),
    history: history.map((h) => ({ id: h.id, action: h.action, lineId: h.lineId, date: h.date, vanName: h.vanName ?? "", driverName: h.driverName ?? "", drop: h.drop, amPm: h.amPm, reason: h.reason ?? "", actorName: h.actorName, createdAt: h.createdAt.toISOString() })),
  };
}

/** Other orders that already hold this date, van and drop on a live line. Returns order names. */
export async function duplicateOrders(db, shop, { date, vanId, drop, orderId }) {
  if (!vanId || drop === null || drop === undefined) return [];
  const others = await db.deliveryBooking.findMany({ where: { shop, date, vanId, drop, orderId: { not: orderId } } });
  if (others.length === 0) return [];
  const live = await db.orderLine.findMany({ where: { shop, lineId: { in: others.map((o) => o.lineId) }, lineStatusId: { in: LIVE_STATUSES } } });
  const ids = [...new Set(live.map((l) => l.orderId))];
  if (ids.length === 0) return [];
  const orders = await db.order.findMany({ where: { shop, orderId: { in: ids } }, select: { orderId: true, name: true } });
  return orders.map((o) => o.name);
}

async function ownedLines(db, shop, orderId, lineIds) {
  const lines = await db.orderLine.findMany({ where: { shop, orderId, lineId: { in: lineIds } } });
  return lines.length === lineIds.length ? lines : null;
}

/** Book (or re-book) delivery for the ticked lines. action "check" only looks for a taken drop. */
export async function bookDelivery(db, { shop, orderId, request, actor }) {
  if (!(await ownedLines(db, shop, orderId, request.lineIds))) return { ok: false, code: "no_lines" };
  const { fleet, names } = await nameMaps(db, shop);
  const live = (list, id) => list.some((i) => i.id === id && i.active);
  if (request.vanId && !live(fleet.vans, request.vanId)) return { ok: false, code: "unknown_van" };
  if (request.driverId && !live(fleet.drivers, request.driverId)) return { ok: false, code: "unknown_driver" };
  if (request.slotId && !live(fleet.slots, request.slotId)) return { ok: false, code: "unknown_slot" };

  const duplicates = await duplicateOrders(db, shop, { date: request.date, vanId: request.vanId, drop: request.drop, orderId });
  if (request.action === "check") return { ok: true, duplicates };
  if (duplicates.length > 0 && !request.allowDuplicate) return { ok: false, code: "duplicate", duplicates };

  const data = { orderId, date: request.date, vanId: request.vanId, driverId: request.driverId, slotId: request.slotId, drop: request.drop, amPm: request.amPm, bookedByName: actor.name };
  for (const lineId of request.lineIds) {
    await db.deliveryBooking.upsert({ where: { shop_lineId: { shop, lineId } }, create: { shop, lineId, ...data }, update: data });
    await db.deliveryHistory.create({
      data: { shop, orderId, lineId, action: "booked", date: request.date, vanName: request.vanId ? names.vans.get(request.vanId) : null, driverName: request.driverId ? names.drivers.get(request.driverId) : null, drop: request.drop, amPm: request.amPm, actorName: actor.name },
    });
  }

  let pmChanged = 0;
  if (request.amPm === "PM" && request.vanId && request.drop !== null) {
    const same = await db.deliveryBooking.findMany({ where: { shop, date: request.date, vanId: request.vanId } });
    const followers = pmFollowers(same, request.vanId, request.date, request.drop, "PM");
    if (followers.length > 0) {
      await db.deliveryBooking.updateMany({ where: { shop, id: { in: followers.map((f) => f.id) } }, data: { amPm: "PM" } });
      pmChanged = new Set(followers.map((f) => f.orderId)).size;
    }
  }
  return { ok: true, saved: request.lineIds.length, duplicates, pmChanged };
}

/** Clear the booking for the ticked lines, log why, and (optionally) email the customer. */
export async function rescheduleDelivery(db, { shop, orderId, request, actor, queueEmail }) {
  const lines = await ownedLines(db, shop, orderId, request.lineIds);
  if (!lines) return { ok: false, code: "no_lines" };
  const booked = await db.deliveryBooking.findMany({ where: { shop, orderId, lineId: { in: request.lineIds } } });
  if (booked.length === 0) return { ok: false, code: "not_booked" };
  const { names } = await nameMaps(db, shop);
  for (const b of booked) {
    await db.deliveryHistory.create({
      data: { shop, orderId, lineId: b.lineId, action: "rescheduled", date: b.date, vanName: b.vanId ? names.vans.get(b.vanId) : null, driverName: b.driverId ? names.drivers.get(b.driverId) : null, drop: b.drop, amPm: b.amPm, reason: request.reason, actorName: actor.name },
    });
  }
  await db.deliveryBooking.deleteMany({ where: { shop, orderId, lineId: { in: booked.map((b) => b.lineId) } } });
  let email = "not_requested";
  if (request.emailCustomer) {
    const sent = await queueEmail({ orderId, lineIds: booked.map((b) => b.lineId), reason: request.reason });
    email = sent.ok ? "queued" : sent.code;
  }
  return { ok: true, cleared: booked.length, email };
}
