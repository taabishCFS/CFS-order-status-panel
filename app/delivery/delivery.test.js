import { beforeEach, describe, expect, it, vi } from "vitest";
import { pmFollowers, readBookingRequest, readBulkFleet, readFleetInput, validDate } from "./delivery-rules.js";
import { bookDelivery, bulkFleet, duplicateOrders, listFleet, orderDelivery, rescheduleDelivery, saveFleetItem } from "./delivery.server.js";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam" };
const O = (n) => `gid://shopify/Order/${n}`;

// A tiny in-memory table that understands the few where-shapes the code uses.
function table(rows = []) {
  let seq = 0;
  const match = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "shop_lineId") return row.shop === v.shop && row.lineId === v.lineId;
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v) return v.in.includes(row[k]);
        if ("not" in v) return row[k] !== v.not;
        return true;
      }
      return row[k] === v;
    });
  const t = {
    rows,
    findMany: async ({ where, take } = {}) => rows.filter((r) => match(r, where)).slice(0, take ?? 1e9),
    findFirst: async ({ where }) => rows.find((r) => match(r, where)) ?? null,
    create: async ({ data }) => { const r = { id: `id${++seq}`, active: true, createdAt: new Date(), ...data }; rows.push(r); return r; },
    update: async ({ where, data }) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r; },
    updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    deleteMany: async ({ where }) => { const keep = rows.filter((r) => !match(r, where)); const n = rows.length - keep.length; rows.splice(0, rows.length, ...keep); return { count: n }; },
    upsert: async ({ where, create, update }) => { const r = rows.find((x) => match(x, where)); if (r) { for (const [k, v] of Object.entries(update)) r[k] = v && typeof v === "object" && "increment" in v ? r[k] + v.increment : v; return r; } return t.create({ data: create }); },
  };
  return t;
}

let db;
beforeEach(() => {
  db = {
    driver: table(), van: table(), deliverySlot: table(), deliveryBooking: table(), deliveryHistory: table(), lineReschedule: table(),
    orderLine: table([1, 2, 3, 4].map((n) => ({ shop: SHOP, orderId: n < 4 ? O(1) : O(2), lineId: `L${n}`, lineStatusId: 4, priceMinor: 12345, quantity: 2, deliveryOutcome: n === 1 ? "confirmed" : null }))),
    order: table([{ shop: SHOP, orderId: O(1), name: "#1001" }, { shop: SHOP, orderId: O(2), name: "#1002" }]),
  };
});

const seedFleet = async () => {
  const van = (await saveFleetItem(db, SHOP, { kind: "van", op: "add", name: "Van 1", extra: "AB12" })).item;
  const driver = (await saveFleetItem(db, SHOP, { kind: "driver", op: "add", name: "Dan", extra: "0700" })).item;
  const slot = (await saveFleetItem(db, SHOP, { kind: "slot", op: "add", name: "8-12" })).item;
  return { van, driver, slot };
};
const book = (over = {}) => ({ action: "book", partner: "CFS", emailCustomer: false, lineIds: ["L1"], date: "2026-12-02", vanId: null, driverId: null, slotId: null, drop: null, amPm: null, allowDuplicate: false, ...over });

describe("reading requests", () => {
  it("validates dates", () => {
    expect(validDate("2026-12-02")).toBe(true);
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2/12/2026")).toBe(false);
  });
  it("reads fleet changes", () => {
    expect(readFleetInput({ kind: "van", op: "add", name: " Van 1 ", extra: "AB12" })).toEqual({ value: { kind: "van", op: "add", id: undefined, name: "Van 1", extra: "AB12", driverId: null, coDriverId: null } });
    expect(readFleetInput({ kind: "driver", op: "add", name: "Dan", extra: "07" }).value).toEqual({ kind: "driver", op: "add", id: undefined, name: "Dan", extra: "07" });
    expect(readFleetInput({ kind: "van", op: "rename", name: "x" }).error).toBe("bad_request");
    expect(readFleetInput({ kind: "car", op: "add", name: "x" }).error).toBe("bad_request");
    expect(readFleetInput({ kind: "van", op: "deactivate", id: "a" })).toEqual({ value: { kind: "van", op: "deactivate", id: "a" } });
  });
  it("reads bookings and rejects rubbish", () => {
    expect(readBookingRequest(book({ vanId: "v", drop: "3", amPm: "PM" })).value).toMatchObject({ drop: 3, amPm: "PM", vanId: "v" });
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "bad" }).error).toBe("bad_date");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", vanId: "v", drop: 17 }).error).toBe("bad_drop");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", drop: 2 }).error).toBe("drop_needs_van");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", amPm: "noon" }).error).toBe("bad_am_pm");
    expect(readBookingRequest({ action: "book", lineIds: [], date: "2026-12-02" }).error).toBe("bad_request");
    expect(readBookingRequest({ action: "reschedule", lineIds: ["a"] }).error).toBe("reason_required");
    expect(readBookingRequest({ action: "reschedule", lineIds: ["a"], reason: "Van broke down" }).error).toBe("attempted_required");
    expect(readBookingRequest({ action: "reschedule", lineIds: ["a"], reason: "Van broke down", attempted: false, charge: "20" }).value).toEqual({ action: "reschedule", lineIds: ["a"], reason: "Van broke down", emailCustomer: true, attempted: false, chargeMinor: 0 });
    expect(readBookingRequest({ action: "reschedule", lineIds: ["a"], reason: "x", attempted: true, charge: "£25.50" }).value.chargeMinor).toBe(2550);
    expect(readBookingRequest({ action: "reschedule", lineIds: ["a"], reason: "x", attempted: true, charge: "" }).value.chargeMinor).toBe(0);
    expect(readBookingRequest({ action: "reschedule", lineIds: ["a"], reason: "x", attempted: true, charge: "abc" }).error).toBe("bad_charge");
  });
  it("a carrier booking keeps only the date, and slots are All Day, AM or PM", () => {
    const r = readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", partner: "TNT", vanId: "v", driverId: "d", drop: 4, amPm: "PM" });
    expect(r.value).toMatchObject({ partner: "TNT", vanId: null, driverId: null, drop: null, amPm: null });
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02" }).value.partner).toBe("CFS");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", partner: "Nobody" }).error).toBe("bad_partner");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", amPm: "ALL" }).value.amPm).toBe("ALL");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", amPm: "constructor" }).error).toBe("bad_am_pm");
    expect(readBookingRequest({ action: "book", lineIds: ["a"], date: "2026-12-02", emailCustomer: true }).value.emailCustomer).toBe(true);
  });
  it("PM makes every later drop on that van and day PM", () => {
    const bs = [{ vanId: "v", date: "d", drop: 1, amPm: "AM" }, { vanId: "v", date: "d", drop: 3, amPm: "AM" }, { vanId: "v", date: "d", drop: 4, amPm: "PM" }, { vanId: "w", date: "d", drop: 5, amPm: "AM" }, { vanId: "v", date: "e", drop: 6, amPm: "AM" }];
    expect(pmFollowers(bs, "v", "d", 2, "PM")).toEqual([bs[1]]);
    expect(pmFollowers(bs, "v", "d", 2, "AM")).toEqual([]);
  });
});

describe("vans with drivers, and bulk changes", () => {
  it("reads bulk changes", () => {
    expect(readBulkFleet({ kind: "van", action: "delete", ids: ["a", "a", "b"] })).toEqual({ value: { kind: "van", action: "delete", ids: ["a", "b"] } });
    expect(readBulkFleet({ kind: "slot", action: "delete", ids: ["a"] }).error).toBe("bad_request");
    expect(readBulkFleet({ kind: "van", action: "wipe", ids: ["a"] }).error).toBe("bad_request");
    expect(readBulkFleet({ kind: "van", action: "delete", ids: [] }).error).toBe("bad_request");
  });
  it("keeps a driver and co-driver on a van and refuses unknown drivers", async () => {
    const { driver } = await seedFleet();
    const co = (await saveFleetItem(db, SHOP, { kind: "driver", op: "add", name: "Cleo", extra: "0800" })).item;
    const v = await saveFleetItem(db, SHOP, { kind: "van", op: "add", name: "Van 2", extra: "", driverId: driver.id, coDriverId: co.id });
    expect(v.ok).toBe(true);
    expect((await listFleet(db, SHOP)).vans.find((x) => x.name === "Van 2")).toMatchObject({ driverId: driver.id, coDriverId: co.id });
    expect((await saveFleetItem(db, SHOP, { kind: "van", op: "add", name: "Van 3", extra: "", driverId: "nope" })).code).toBe("unknown_driver");
  });
  it("switches several on and off, and deletes only what nothing uses", async () => {
    const { van, driver } = await seedFleet();
    const spare = (await saveFleetItem(db, SHOP, { kind: "van", op: "add", name: "Spare" })).item;
    expect(await bulkFleet(db, SHOP, { kind: "van", action: "deactivate", ids: [van.id, spare.id] })).toMatchObject({ ok: true, changed: 2 });
    expect((await listFleet(db, SHOP)).vans.every((x) => !x.active)).toBe(true);
    await db.deliveryBooking.create({ data: { shop: SHOP, lineId: "L1", orderId: O(1), vanId: van.id, driverId: driver.id, date: "2026-12-02" } });
    const del = await bulkFleet(db, SHOP, { kind: "van", action: "delete", ids: [van.id, spare.id] });
    expect(del).toMatchObject({ ok: true, changed: 1, blocked: ["Van 1"] });
    expect((await listFleet(db, SHOP)).vans.map((x) => x.name)).toEqual(["Van 1"]);
    expect((await bulkFleet(db, SHOP, { kind: "driver", action: "delete", ids: [driver.id] })).blocked).toEqual(["Dan"]);
    expect((await bulkFleet(db, SHOP, { kind: "van", action: "delete", ids: ["nope"] })).code).toBe("not_found");
  });
});

describe("fleet lists", () => {
  it("adds, renames, deactivates and restores", async () => {
    const { van } = await seedFleet();
    expect((await saveFleetItem(db, SHOP, { kind: "van", op: "add", name: "Van 1" })).code).toBe("duplicate_name");
    expect((await saveFleetItem(db, SHOP, { kind: "van", op: "rename", id: van.id, name: "Van One", extra: "ZZ" })).ok).toBe(true);
    expect((await listFleet(db, SHOP)).vans[0]).toMatchObject({ name: "Van One", extra: "ZZ", active: true });
    await saveFleetItem(db, SHOP, { kind: "van", op: "deactivate", id: van.id });
    expect((await listFleet(db, SHOP)).vans[0].active).toBe(false);
    await saveFleetItem(db, SHOP, { kind: "van", op: "restore", id: van.id });
    expect((await listFleet(db, SHOP)).vans[0].active).toBe(true);
    expect((await saveFleetItem(db, SHOP, { kind: "van", op: "deactivate", id: "nope" })).code).toBe("not_found");
  });
});

describe("booking", () => {
  it("books lines and logs history", async () => {
    const { van, driver, slot } = await seedFleet();
    const r = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ lineIds: ["L1", "L2"], vanId: van.id, driverId: driver.id, slotId: slot.id, drop: 2, amPm: "AM" }), actor });
    expect(r).toMatchObject({ ok: true, saved: 2 });
    const view = await orderDelivery(db, SHOP, O(1));
    expect(view.bookings).toHaveLength(2);
    expect(view.bookings[0]).toMatchObject({ partner: "CFS", vanName: "Van 1", driverName: "Dan", drop: 2, amPm: "AM", bookedByName: "Sam", confirmNote: null });
    expect(view.history.map((h) => h.action)).toEqual(["booked", "booked"]);
  });
  it("Book & Email queues the customer email, Book & Save does not", async () => {
    const queueEmail = vi.fn(async () => ({ ok: true }));
    const r = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ emailCustomer: true, amPm: "ALL", drop: null }), actor, queueEmail });
    expect(r.email).toBe("queued");
    expect(queueEmail).toHaveBeenCalledWith({ orderId: O(1), lineIds: ["L1"], date: "2026-12-02", amPm: "ALL", drop: null });
    const saved = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ date: "2026-12-03" }), actor, queueEmail });
    expect(saved.email).toBe("not_requested");
    expect(queueEmail).toHaveBeenCalledTimes(1);
    const failed = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ emailCustomer: true }), actor, queueEmail: async () => ({ ok: false, code: "email_off" }) });
    expect(failed).toMatchObject({ ok: true, email: "email_off" });
  });
  it("keeps the partner on the booking and in the history", async () => {
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ partner: "TNT" }), actor });
    const view = await orderDelivery(db, SHOP, O(1));
    expect(view.bookings[0].partner).toBe("TNT");
    expect(view.history[0].partner).toBe("TNT");
  });
  it("re-booking replaces the booking instead of adding one", async () => {
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book(), actor });
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ date: "2026-12-05" }), actor });
    expect(db.deliveryBooking.rows).toHaveLength(1);
    expect(db.deliveryBooking.rows[0].date).toBe("2026-12-05");
  });
  it("refuses lines that are not on the order and unknown or inactive fleet items", async () => {
    const { van } = await seedFleet();
    expect((await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ lineIds: ["L4"] }), actor })).code).toBe("no_lines");
    expect((await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ vanId: "zzz" }), actor })).code).toBe("unknown_van");
    await saveFleetItem(db, SHOP, { kind: "van", op: "deactivate", id: van.id });
    expect((await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ vanId: van.id }), actor })).code).toBe("unknown_van");
  });
  it("warns about a taken drop, and books anyway when told to", async () => {
    const { van } = await seedFleet();
    await bookDelivery(db, { shop: SHOP, orderId: O(2), request: book({ lineIds: ["L4"], vanId: van.id, drop: 3 }), actor });
    expect(await duplicateOrders(db, SHOP, { date: "2026-12-02", vanId: van.id, drop: 3, orderId: O(1) })).toEqual(["#1002"]);
    const check = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ action: "check", vanId: van.id, drop: 3 }), actor });
    expect(check).toEqual({ ok: true, duplicates: ["#1002"] });
    expect(db.deliveryBooking.rows).toHaveLength(1);
    const refused = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ vanId: van.id, drop: 3 }), actor });
    expect(refused).toMatchObject({ ok: false, code: "duplicate", duplicates: ["#1002"] });
    const forced = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ vanId: van.id, drop: 3, allowDuplicate: true }), actor });
    expect(forced.ok).toBe(true);
  });
  it("ignores a taken drop whose line is no longer live", async () => {
    const { van } = await seedFleet();
    await bookDelivery(db, { shop: SHOP, orderId: O(2), request: book({ lineIds: ["L4"], vanId: van.id, drop: 3 }), actor });
    db.orderLine.rows.find((l) => l.lineId === "L4").lineStatusId = 6;
    expect(await duplicateOrders(db, SHOP, { date: "2026-12-02", vanId: van.id, drop: 3, orderId: O(1) })).toEqual([]);
  });
  it("PM on a drop turns later drops that day PM", async () => {
    const { van } = await seedFleet();
    await bookDelivery(db, { shop: SHOP, orderId: O(2), request: book({ lineIds: ["L4"], vanId: van.id, drop: 5, amPm: "AM" }), actor });
    const r = await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ vanId: van.id, drop: 2, amPm: "PM" }), actor });
    expect(r.pmChanged).toBe(1);
    expect(db.deliveryBooking.rows.find((b) => b.lineId === "L4").amPm).toBe("PM");
  });
});

describe("rescheduling", () => {
  it("clears the booking, logs the reason and emails the customer", async () => {
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ lineIds: ["L1", "L2"] }), actor });
    const queueEmail = vi.fn(async () => ({ ok: true }));
    const r = await rescheduleDelivery(db, { shop: SHOP, orderId: O(1), request: { lineIds: ["L1"], reason: "Van broke down", emailCustomer: true }, actor, queueEmail });
    expect(r).toEqual({ ok: true, cleared: 1, chargedMinor: 0, email: "queued" });
    expect(db.lineReschedule.rows).toEqual([]);
    expect(db.deliveryBooking.rows.map((b) => b.lineId)).toEqual(["L2"]);
    expect(db.deliveryHistory.rows.at(-1)).toMatchObject({ action: "rescheduled", reason: "Van broke down", lineId: "L1" });
    expect(queueEmail).toHaveBeenCalledWith({ orderId: O(1), lineIds: ["L1"], reason: "Van broke down" });
  });
  it("can skip the email, and reports a failed one", async () => {
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book(), actor });
    const queueEmail = vi.fn();
    expect(await rescheduleDelivery(db, { shop: SHOP, orderId: O(1), request: { lineIds: ["L1"], reason: "x", emailCustomer: false }, actor, queueEmail })).toMatchObject({ email: "not_requested" });
    expect(queueEmail).not.toHaveBeenCalled();
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book(), actor });
    expect(await rescheduleDelivery(db, { shop: SHOP, orderId: O(1), request: { lineIds: ["L1"], reason: "x", emailCustomer: true }, actor, queueEmail: async () => ({ ok: false, code: "email_off" }) })).toMatchObject({ ok: true, email: "email_off" });
  });
  it("delivery attempted before: every line's count goes up, the agreed charge is recorded once on the first line", async () => {
    const again = async (chargeMinor) => {
      await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book({ lineIds: ["L1", "L2"] }), actor });
      return rescheduleDelivery(db, { shop: SHOP, orderId: O(1), request: { lineIds: ["L1", "L2"], reason: "x", emailCustomer: false, attempted: true, chargeMinor }, actor, queueEmail: vi.fn() });
    };
    expect(await again(2500)).toMatchObject({ cleared: 2, chargedMinor: 2500 });
    expect(await again(0)).toMatchObject({ chargedMinor: 0 });
    expect(db.lineReschedule.rows).toEqual([
      expect.objectContaining({ lineId: "L1", orderId: O(1), chargeMinor: 2500, count: 2, updatedByName: "Sam" }),
      expect.objectContaining({ lineId: "L2", chargeMinor: 0, count: 2 }),
    ]);
  });
  it("No: nothing is recorded", async () => {
    await bookDelivery(db, { shop: SHOP, orderId: O(1), request: book(), actor });
    await rescheduleDelivery(db, { shop: SHOP, orderId: O(1), request: { lineIds: ["L1"], reason: "x", emailCustomer: false, attempted: false, chargeMinor: 0 }, actor, queueEmail: vi.fn() });
    expect(db.lineReschedule.rows).toEqual([]);
  });
  it("refuses lines that are not booked", async () => {
    expect((await rescheduleDelivery(db, { shop: SHOP, orderId: O(1), request: { lineIds: ["L1"], reason: "x", emailCustomer: false }, actor, queueEmail: vi.fn() })).code).toBe("not_booked");
  });
});
