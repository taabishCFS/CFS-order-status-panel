import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryTypeOf, keywordIndex, parseBulkParams, readBulkRequest, splitKeywords } from "./bulk-delivery-rules.js";
import { bulkBook, bulkReschedule, listBookable, loadForBooking, markLines } from "./bulk-delivery.server.js";
import { saveFleetItem } from "./delivery.server.js";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam" };
const O = (n) => `gid://shopify/Order/${n}`;

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
    findMany: async ({ where } = {}) => rows.filter((r) => match(r, where)),
    findFirst: async ({ where }) => rows.find((r) => match(r, where)) ?? null,
    create: async ({ data }) => { const r = { id: `id${++seq}`, active: true, createdAt: new Date(), ...data }; rows.push(r); return r; },
    update: async ({ where, data }) => Object.assign(rows.find((x) => x.id === where.id), data),
    updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    deleteMany: async ({ where }) => { const keep = rows.filter((r) => !match(r, where)); const n = rows.length - keep.length; rows.splice(0, rows.length, ...keep); return { count: n }; },
    upsert: async ({ where, create, update }) => { const r = rows.find((x) => match(x, where)); if (r) return Object.assign(r, update); return t.create({ data: create }); },
  };
  return t;
}

const line = (orderId, n, over = {}) => ({ shop: SHOP, orderId, lineId: `L${n}`, title: `Item ${n}`, sku: `SKU${n}`, vendor: "Acme", quantity: 1, lineStatusId: 4, orderArchived: false, ...over });
const order = (n, over = {}) => ({ shop: SHOP, orderId: O(n), name: `UD${3160 + n}`, postcode: `AB${n} 1CD`, createdAt: new Date(2026, 10, n), outstandingMinor: 0, lineStatusIds: [4], ...over });

let db;
beforeEach(() => {
  db = {
    driver: table(), van: table(), deliverySlot: table(), deliveryBooking: table(), deliveryHistory: table(),
    orderLine: table([line(O(1), 1), line(O(1), 2), line(O(2), 3), line(O(3), 4, { vendor: "Zed" }), line(O(4), 5), line(O(5), 6, { lineStatusId: 3 })]),
    order: table([order(1), order(2), order(3), order(4, { outstandingMinor: 5000 }), order(5, { lineStatusIds: [3] })]),
  };
});

describe("rules", () => {
  it("reads search text, params and delivery types", () => {
    expect(splitKeywords(" UD3163, CF43 4LT ,, ")).toEqual(["UD3163", "CF43 4LT"]);
    expect(parseBulkParams(new URLSearchParams("q=ab&brand=Acme&page=3"))).toEqual({ q: "ab", brand: "Acme", page: 3 });
    expect(keywordIndex(["zz", "ab2"], { name: "UD1", postcode: "AB2 1CD" })).toBe(1);
    expect(deliveryTypeOf(["Sofa", "Two Man Delivery [svc:two_man]", "Peace Of Mind [svc:peace_of_mind]"])).toBe("Peace Of Mind");
    expect(deliveryTypeOf(["Sofa"])).toBe("Free Door Delivery");
  });
  it("reads each action and refuses bad ones", () => {
    expect(readBulkRequest({ action: "mark", mark: "TNT", lineIds: ["a"] }).value.mark).toBe("TNT");
    expect(readBulkRequest({ action: "mark", mark: "UPS", lineIds: ["a"] }).error).toBe("bad_request");
    const book = { action: "book", date: "2026-12-02", vanId: "v", rows: [{ lineId: "a", drop: 1, amPm: "AM" }] };
    expect(readBulkRequest(book).value).toMatchObject({ vanId: "v", rows: [{ lineId: "a", drop: 1, amPm: "AM" }] });
    expect(readBulkRequest({ ...book, vanId: "prebook" }).value.vanId).toBe("prebook");
    expect(readBulkRequest({ ...book, vanId: "" }).error).toBe("van_required");
    expect(readBulkRequest({ ...book, date: "2026-13-40" }).error).toBe("bad_date");
    expect(readBulkRequest({ ...book, rows: [{ lineId: "a", drop: "", amPm: "AM" }] }).error).toBe("drop_required");
    expect(readBulkRequest({ ...book, rows: [{ lineId: "a", drop: 17, amPm: "AM" }] }).error).toBe("drop_required");
    expect(readBulkRequest({ ...book, rows: [{ lineId: "a", drop: 1, amPm: "" }] }).error).toBe("slot_required");
    expect(readBulkRequest({ action: "reschedule", lineIds: ["a"] }).value).toEqual({ action: "reschedule", lineIds: ["a"], reason: "" });
  });
});

describe("the Book Delivery list", () => {
  it("lists only ready lines on paid, fully ready orders, newest order first", async () => {
    const r = await listBookable(db, SHOP, { q: "", brand: null, page: 1 });
    expect(r.rows.map((x) => x.lineId)).toEqual(["L4", "L3", "L1", "L2"]);
    expect(r.summary).toEqual({ lines: 4, orders: 3 });
    expect(r.rows[0]).toMatchObject({ orderName: "UD3163", brand: "Zed", code: "SKU4", deliveryType: "Free Door Delivery" });
  });
  it("filters by brand and searches order numbers and postcodes in the order typed", async () => {
    expect((await listBookable(db, SHOP, { q: "", brand: "Zed", page: 1 })).rows.map((x) => x.lineId)).toEqual(["L4"]);
    expect((await listBookable(db, SHOP, { q: "UD3162, ab1", brand: null, page: 1 })).rows.map((x) => x.lineId)).toEqual(["L3", "L1", "L2"]);
  });
  it("hides booked and carrier-marked lines but keeps pre-booked ones", async () => {
    db.deliveryBooking.rows.push({ shop: SHOP, orderId: O(1), lineId: "L1", partner: "CFS", date: "2026-12-02" });
    db.deliveryBooking.rows.push({ shop: SHOP, orderId: O(2), lineId: "L3", partner: "TNT", date: null });
    db.deliveryBooking.rows.push({ shop: SHOP, orderId: O(1), lineId: "L2", partner: "CFS", date: "2026-12-03", prebook: true });
    const r = await listBookable(db, SHOP, { q: "", brand: null, page: 1 });
    expect(r.rows.map((x) => [x.lineId, x.prebook])).toEqual([["L4", false], ["L2", true]]);
  });
  it("Mark takes lines off the list and logs it", async () => {
    expect(await markLines(db, { shop: SHOP, lineIds: ["L1", "L3"], partner: "Pallet", actor })).toEqual({ ok: true, marked: 2 });
    expect((await listBookable(db, SHOP, { q: "", brand: null, page: 1 })).rows.map((x) => x.lineId)).toEqual(["L4", "L2"]);
    expect(db.deliveryHistory.rows.map((h) => [h.action, h.partner])).toEqual([["marked", "Pallet"], ["marked", "Pallet"]]);
  });
});

describe("booking many lines", () => {
  let van;
  beforeEach(async () => {
    const dan = (await saveFleetItem(db, SHOP, { kind: "driver", op: "add", name: "Dan", extra: "07" })).item;
    van = (await saveFleetItem(db, SHOP, { kind: "van", op: "add", name: "Van 1", extra: "", driverId: dan.id })).item;
  });
  const request = (over = {}) => ({ date: "2026-12-02", vanId: van.id, allowDuplicate: false, rows: [{ lineId: "L1", drop: 1, amPm: "AM" }, { lineId: "L2", drop: 1, amPm: "AM" }, { lineId: "L3", drop: 2, amPm: "PM" }], ...over });

  it("loads the ticked lines in ticked order with the active vans", async () => {
    const r = await loadForBooking(db, SHOP, ["L3", "L1", "nope"]);
    expect(r.rows.map((x) => x.lineId)).toEqual(["L3", "L1"]);
    expect(r.vans).toEqual([{ id: van.id, name: "Van 1" }]);
  });
  it("books every line with its own drop and slot, uses the van's driver, and emails each order once", async () => {
    const queueEmail = vi.fn(async () => ({ ok: true }));
    const r = await bulkBook(db, { shop: SHOP, request: request(), actor, queueEmail });
    expect(r).toMatchObject({ ok: true, saved: 3, orders: 2, emailed: 2, emailFailed: 0 });
    expect(queueEmail).toHaveBeenCalledTimes(2);
    expect(queueEmail.mock.calls[0][0]).toMatchObject({ orderId: O(1), prebook: false, lines: [{ lineId: "L1", drop: 1, amPm: "AM" }, { lineId: "L2" }] });
    const b = db.deliveryBooking.rows.find((x) => x.lineId === "L3");
    expect(b).toMatchObject({ partner: "CFS", date: "2026-12-02", drop: 2, amPm: "PM", vanId: van.id, emailed: true, prebook: false });
    expect(b.driverId).toBeTruthy();
    expect(db.deliveryHistory.rows).toHaveLength(3);
    expect((await listBookable(db, SHOP, { q: "", brand: null, page: 1 })).rows.map((x) => x.lineId)).toEqual(["L4"]);
  });
  it("BOOK DELIVERY books the lines without emailing anyone", async () => {
    const queueEmail = vi.fn(async () => ({ ok: true }));
    const r = await bulkBook(db, { shop: SHOP, request: request({ emailCustomers: false }), actor, queueEmail });
    expect(r).toMatchObject({ ok: true, saved: 3, orders: 2, emailed: 0, emailFailed: 0, emailRequested: false });
    expect(queueEmail).not.toHaveBeenCalled();
    expect(db.deliveryBooking.rows.find((x) => x.lineId === "L3")).toMatchObject({ date: "2026-12-02", emailed: false });
  });
  it("a pre-book needs no van, keeps the lines on the list, and uses the pre-book email", async () => {
    const queueEmail = vi.fn(async () => ({ ok: true }));
    const r = await bulkBook(db, { shop: SHOP, request: request({ vanId: "prebook" }), actor, queueEmail });
    expect(r.ok).toBe(true);
    expect(queueEmail.mock.calls[0][0].prebook).toBe(true);
    expect(db.deliveryBooking.rows[0]).toMatchObject({ prebook: true, vanId: null });
    expect(db.deliveryHistory.rows[0].action).toBe("prebooked");
    expect((await listBookable(db, SHOP, { q: "", brand: null, page: 1 })).rows).toHaveLength(4);
  });
  it("warns about a taken drop, and PM moves later drops on the van to PM", async () => {
    db.deliveryBooking.rows.push({ id: "x1", shop: SHOP, orderId: O(9), lineId: "Z1", partner: "CFS", date: "2026-12-02", vanId: van.id, drop: 1, amPm: "AM" });
    db.orderLine.rows.push(line(O(9), 90, { lineId: "Z1", lineStatusId: 4 }));
    db.order.rows.push(order(9));
    const warn = await bulkBook(db, { shop: SHOP, request: request(), actor, queueEmail: async () => ({ ok: true }) });
    expect(warn).toMatchObject({ ok: false, code: "duplicate", duplicates: ["UD3169"] });
    db.deliveryBooking.rows.push({ id: "x2", shop: SHOP, orderId: O(8), lineId: "Z2", partner: "CFS", date: "2026-12-02", vanId: van.id, drop: 5, amPm: "AM" });
    const ok = await bulkBook(db, { shop: SHOP, request: request({ allowDuplicate: true }), actor, queueEmail: async () => ({ ok: true }) });
    expect(ok).toMatchObject({ ok: true, pmChanged: 1 });
    expect(db.deliveryBooking.rows.find((x) => x.lineId === "Z2").amPm).toBe("PM");
  });
  it("saves the booking even when the email cannot be queued, and says so", async () => {
    const r = await bulkBook(db, { shop: SHOP, request: request(), actor, queueEmail: async () => ({ ok: false, code: "email_off" }) });
    expect(r).toMatchObject({ ok: true, emailed: 0, emailFailed: 2, emailCode: "email_off" });
    expect(db.deliveryBooking.rows.every((x) => !x.emailed)).toBe(true);
  });
  it("refuses unknown vans and lines that are not bookable", async () => {
    expect((await bulkBook(db, { shop: SHOP, request: request({ vanId: "nope" }), actor, queueEmail: async () => ({ ok: true }) })).code).toBe("unknown_van");
    expect((await bulkBook(db, { shop: SHOP, request: request({ rows: [{ lineId: "L6", drop: 1, amPm: "AM" }] }), actor, queueEmail: async () => ({ ok: true }) })).code).toBe("no_lines");
  });
  it("reschedule clears bookings and marks and logs them", async () => {
    await bulkBook(db, { shop: SHOP, request: request(), actor, queueEmail: async () => ({ ok: true }) });
    const r = await bulkReschedule(db, { shop: SHOP, request: { lineIds: ["L1", "L3", "L4"], reason: "" }, actor });
    expect(r).toEqual({ ok: true, cleared: 2 });
    expect(db.deliveryBooking.rows.map((x) => x.lineId)).toEqual(["L2"]);
    expect(db.deliveryHistory.rows.filter((h) => h.action === "rescheduled")).toHaveLength(2);
    expect((await bulkReschedule(db, { shop: SHOP, request: { lineIds: ["L4"], reason: "" }, actor })).code).toBe("not_booked");
  });
});
