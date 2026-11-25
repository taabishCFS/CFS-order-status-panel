// The bulk Book Delivery pages: the list of lines ready to book, Mark TNT/Pallet/..., and booking many lines (many orders) at once.
import { duplicateOrders, listFleet } from "./delivery.server.js";
import { pmFollowers } from "./delivery-rules.js";
import { placeOnVan } from "./drop-shift.server.js";
import { BOOKABLE_STATUSES, IGNORED_STATUSES, PAGE_SIZE, deliveryTypeOf, keywordIndex, splitKeywords } from "./bulk-delivery-rules.js";

const ALLOWED = new Set([...BOOKABLE_STATUSES, ...IGNORED_STATUSES]);
const brandOf = (vendor) => vendor?.trim() || "Unmapped";
const OWN = "CFS";
/** A booking that takes a line off the Book Delivery list: a carrier mark, or a real (not pre-booked) date. */
const leavesList = (b) => b.partner !== OWN || (Boolean(b.date) && !b.prebook);

/** Orders that may be booked: not cancelled or archived, nothing owed, and every line bookable (or finished). */
function readyOrder(o) {
  return !o.cancelledAt && !o.archivedAt && (o.outstandingMinor ?? 0) <= 0 && (o.lineStatusIds ?? []).every((s) => ALLOWED.has(s));
}

/**
 * One page of the Book Delivery list: { rows, summary: { lines, orders }, total, page, pageCount }.
 * params: { q (order numbers or postcodes, comma separated), brand, page }.
 */
export async function listBookable(db, shop, params) {
  const lines = await db.orderLine.findMany({ where: { shop, lineStatusId: { in: BOOKABLE_STATUSES }, orderArchived: false } });
  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const orders = orderIds.length ? await db.order.findMany({ where: { shop, orderId: { in: orderIds } } }) : [];
  const byOrder = new Map(orders.filter(readyOrder).map((o) => [o.orderId, o]));
  const keywords = splitKeywords(params.q);
  const booked = lines.length ? await db.deliveryBooking.findMany({ where: { shop, orderId: { in: [...byOrder.keys()] } } }) : [];
  const booking = new Map(booked.map((b) => [b.lineId, b]));
  const all = orderIds.length ? await db.orderLine.findMany({ where: { shop, orderId: { in: [...byOrder.keys()] } } }) : [];
  const titles = new Map();
  for (const l of all) titles.set(l.orderId, [...(titles.get(l.orderId) ?? []), l.title]);

  const picked = [];
  for (const l of lines) {
    const order = byOrder.get(l.orderId);
    if (!order) continue;
    const b = booking.get(l.lineId);
    if (b && leavesList(b)) continue;
    if (params.brand && brandOf(l.vendor) !== params.brand) continue;
    const at = keywords.length ? keywordIndex(keywords, order) : 0;
    if (at < 0) continue;
    picked.push({ l, order, at, prebook: Boolean(b?.prebook) });
  }
  picked.sort((a, b) => (keywords.length ? a.at - b.at : 0) || b.order.createdAt - a.order.createdAt || a.order.name.localeCompare(b.order.name) || a.l.lineId.localeCompare(b.l.lineId));

  const total = picked.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = picked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ l, order, prebook }) => ({
    lineId: l.lineId,
    orderId: l.orderId,
    orderName: order.name,
    orderCreatedAt: order.createdAt.toISOString(),
    brand: brandOf(l.vendor),
    product: l.title,
    code: l.sku ?? "",
    quantity: l.quantity,
    lineStatusId: l.lineStatusId,
    postcode: order.postcode ?? "",
    deliveryType: deliveryTypeOf(titles.get(l.orderId) ?? []),
    prebook,
  }));
  return { rows, summary: { lines: total, orders: new Set(picked.map((p) => p.l.orderId)).size }, total, page, pageCount };
}

/** Mark ticked lines as going by a carrier (TNT, Pallet ...): they leave the list. */
export async function markLines(db, { shop, lineIds, partner, actor }) {
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds }, lineStatusId: { in: BOOKABLE_STATUSES } } });
  for (const l of lines) {
    const data = { orderId: l.orderId, partner, date: null, vanId: null, driverId: null, drop: null, amPm: null, prebook: false, emailed: false, bookedByName: actor.name };
    await db.deliveryBooking.upsert({ where: { shop_lineId: { shop, lineId: l.lineId } }, create: { shop, lineId: l.lineId, ...data }, update: data });
    await db.deliveryHistory.create({ data: { shop, orderId: l.orderId, lineId: l.lineId, action: "marked", partner, actorName: actor.name } });
  }
  return { ok: true, marked: lines.length };
}

/** The ticked lines for the Delivery Booking page, in the order they were ticked, plus the vans to choose from. */
export async function loadForBooking(db, shop, lineIds) {
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds }, lineStatusId: { in: BOOKABLE_STATUSES } } });
  const byId = new Map(lines.map((l) => [l.lineId, l]));
  const ordered = lineIds.map((id) => byId.get(id)).filter(Boolean);
  const orderIds = [...new Set(ordered.map((l) => l.orderId))];
  const orders = orderIds.length ? await db.order.findMany({ where: { shop, orderId: { in: orderIds } } }) : [];
  const orderOf = new Map(orders.map((o) => [o.orderId, o]));
  const booked = ordered.length ? await db.deliveryBooking.findMany({ where: { shop, lineId: { in: ordered.map((l) => l.lineId) } } }) : [];
  const booking = new Map(booked.map((b) => [b.lineId, b]));
  const all = orderIds.length ? await db.orderLine.findMany({ where: { shop, orderId: { in: orderIds } } }) : [];
  const titles = new Map();
  for (const l of all) titles.set(l.orderId, [...(titles.get(l.orderId) ?? []), l.title]);
  const fleet = await listFleet(db, shop);
  return {
    rows: ordered.map((l) => {
      const o = orderOf.get(l.orderId);
      const b = booking.get(l.lineId);
      return {
        lineId: l.lineId,
        orderId: l.orderId,
        orderName: o?.name ?? "",
        orderCreatedAt: o?.createdAt?.toISOString?.() ?? null,
        product: l.title,
        code: l.sku ?? "",
        quantity: l.quantity,
        lineStatusId: l.lineStatusId,
        postcode: o?.postcode ?? "",
        deliveryType: deliveryTypeOf(titles.get(l.orderId) ?? []),
        deliveryDate: b?.date ?? null,
        drop: b?.drop ?? null,
        amPm: b?.amPm === "AM" || b?.amPm === "PM" ? b.amPm : "",
        prebook: Boolean(b?.prebook),
        emailed: Boolean(b?.emailed),
      };
    }),
    vans: fleet.vans.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name })),
  };
}

/**
 * Book the ticked lines on one date and van, each with its own drop and AM/PM, then email each customer once for their order.
 * request: { date, vanId (a van id or "prebook"), rows: [{ lineId, drop, amPm }], allowDuplicate }.
 * queueEmail({ orderId, lines: [{ lineId, date, amPm, drop }], prebook }) queues one customer email and returns { ok } or { ok:false, code }.
 */
export async function bulkBook(db, { shop, request, actor, queueEmail }) {
  const prebook = request.vanId === "prebook";
  const fleet = await listFleet(db, shop);
  const van = prebook ? null : fleet.vans.find((v) => v.id === request.vanId && v.active);
  if (!prebook && !van) return { ok: false, code: "unknown_van" };
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: request.rows.map((r) => r.lineId) }, lineStatusId: { in: BOOKABLE_STATUSES } } });
  if (lines.length !== request.rows.length) return { ok: false, code: "no_lines" };
  const orderOf = new Map(lines.map((l) => [l.lineId, l.orderId]));

  if (!prebook && !request.allowDuplicate) {
    const names = new Set();
    for (const key of new Set(request.rows.map((r) => `${orderOf.get(r.lineId)}|${r.drop}`))) {
      const [orderId, drop] = key.split("|");
      for (const n of await duplicateOrders(db, shop, { date: request.date, vanId: van.id, drop: Number(drop), orderId })) names.add(n);
    }
    if (names.size > 0) return { ok: false, code: "duplicate", duplicates: [...names] };
  }

  const driver = van?.driverId ? fleet.drivers.find((d) => d.id === van.driverId) : null;
  for (const r of request.rows) {
    const orderId = orderOf.get(r.lineId);
    const data = { orderId, partner: OWN, date: request.date, vanId: van?.id ?? null, driverId: van?.driverId ?? null, drop: r.drop, amPm: r.amPm, prebook, emailed: false, bookedByName: actor.name };
    await db.deliveryBooking.upsert({ where: { shop_lineId: { shop, lineId: r.lineId } }, create: { shop, lineId: r.lineId, ...data }, update: data });
    await db.deliveryHistory.create({
      data: { shop, orderId, lineId: r.lineId, action: prebook ? "prebooked" : "booked", partner: OWN, date: request.date, vanName: van?.name ?? null, driverName: driver?.name ?? null, drop: r.drop, amPm: r.amPm, actorName: actor.name },
    });
  }

  // Each booked order takes its drop; orders already on that van and day that are in the way move down.
  let shifted = 0;
  if (van) {
    const pinned = new Map();
    for (const r of request.rows) pinned.set(orderOf.get(r.lineId), r.drop);
    const placed = await placeOnVan(db, { shop, date: request.date, vanId: van.id, pinned, actor });
    if (placed.ok) shifted = placed.moved;
  }
  let pmChanged = 0;
  if (van) {
    const same = await db.deliveryBooking.findMany({ where: { shop, date: request.date, vanId: van.id } });
    const lastPm = Math.min(...request.rows.filter((r) => r.amPm === "PM").map((r) => r.drop));
    const followers = Number.isFinite(lastPm) ? pmFollowers(same, van.id, request.date, lastPm, "PM") : [];
    if (followers.length > 0) {
      await db.deliveryBooking.updateMany({ where: { shop, id: { in: followers.map((f) => f.id) } }, data: { amPm: "PM" } });
      pmChanged = new Set(followers.map((f) => f.orderId)).size;
    }
  }

  const byOrder = new Map();
  for (const r of request.rows) byOrder.set(orderOf.get(r.lineId), [...(byOrder.get(orderOf.get(r.lineId)) ?? []), { lineId: r.lineId, date: request.date, amPm: r.amPm, drop: r.drop }]);
  let emailed = 0;
  const failed = [];
  for (const [orderId, rows] of byOrder) {
    const sent = await queueEmail({ orderId, lines: rows, prebook });
    if (sent.ok) {
      emailed += 1;
      await db.deliveryBooking.updateMany({ where: { shop, lineId: { in: rows.map((x) => x.lineId) } }, data: { emailed: true } });
    } else failed.push(sent.code);
  }
  return { ok: true, saved: request.rows.length, orders: byOrder.size, emailed, emailFailed: failed.length, emailCode: failed[0] ?? null, pmChanged, shifted };
}

/** Clear the booking (or carrier mark) on the ticked lines and log it (legacy Reschedule: no email). */
export async function bulkReschedule(db, { shop, request, actor }) {
  const booked = await db.deliveryBooking.findMany({ where: { shop, lineId: { in: request.lineIds } } });
  const clearable = booked;
  if (clearable.length === 0) return { ok: false, code: "not_booked" };
  const fleet = await listFleet(db, shop);
  const van = new Map(fleet.vans.map((v) => [v.id, v.name]));
  const driver = new Map(fleet.drivers.map((d) => [d.id, d.name]));
  for (const b of clearable) {
    await db.deliveryHistory.create({
      data: { shop, orderId: b.orderId, lineId: b.lineId, action: "rescheduled", partner: b.partner ?? OWN, date: b.date, vanName: b.vanId ? van.get(b.vanId) ?? null : null, driverName: b.driverId ? driver.get(b.driverId) ?? null : null, drop: b.drop, amPm: b.amPm, reason: request.reason || null, actorName: actor.name },
    });
  }
  await db.deliveryBooking.deleteMany({ where: { shop, lineId: { in: clearable.map((b) => b.lineId) } } });
  return { ok: true, cleared: clearable.length };
}
