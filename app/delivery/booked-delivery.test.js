import { beforeEach, describe, expect, it } from "vitest";
import { parseBookedParams, placeDrops, readBookedRequest } from "./booked-delivery-rules.js";
import { listBooked, saveDrops } from "./booked-delivery.server.js";
import { bulkBook } from "./bulk-delivery.server.js";

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
    updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    upsert: async ({ where, create, update }) => { const r = rows.find((x) => match(x, where)); if (r) return Object.assign(r, update); return t.create({ data: create }); },
  };
  return t;
}

describe("placeDrops", () => {
  const cur = (pairs) => new Map(pairs);
  it("moves the order that held the drop, and the ones in the way, down one place", () => {
    const r = placeDrops(cur([["a", 1], ["b", 2], ["c", 3], ["d", 4]]), new Map([["x", 2]]));
    expect([...r.drops]).toEqual([["x", 2], ["a", 1], ["b", 3], ["c", 4], ["d", 5]]);
  });
  it("leaves orders alone when nothing is in the way, and keeps gaps", () => {
    const r = placeDrops(cur([["a", 1], ["b", 5]]), new Map([["x", 3]]));
    expect(r.drops.get("a")).toBe(1);
    expect(r.drops.get("b")).toBe(5);
  });
  it("lets two orders swap", () => {
    const r = placeDrops(cur([["a", 1], ["b", 2], ["c", 3]]), new Map([["a", 2], ["b", 1]]));
    expect([r.drops.get("a"), r.drops.get("b"), r.drops.get("c")]).toEqual([2, 1, 3]);
  });
  it("refuses a drop above 16 or below 1", () => {
    expect(placeDrops(cur([["a", 16]]), new Map([["x", 16]])).code).toBe("drop_limit");
    expect(placeDrops(cur([]), new Map([["x", 0]])).code).toBe("bad_drop");
  });
});

describe("reading requests", () => {
  it("defaults to a single day and orders the range", () => {
    expect(parseBookedParams(new URLSearchParams(""), "2026-11-25")).toMatchObject({ from: "2026-11-25", to: "2026-11-25", brand: null });
    expect(parseBookedParams(new URLSearchParams("from=2026-11-30&to=2026-11-26&brand=Acme"), "2026-11-25")).toMatchObject({ from: "2026-11-26", to: "2026-11-30", brand: "Acme" });
    expect(parseBookedParams(new URLSearchParams("from=nope"), "2026-11-25").from).toBe("2026-11-25");
  });
  it("reads the drops and reschedule actions", () => {
    expect(readBookedRequest({ action: "drops", date: "2026-11-25", vanId: "v", rows: [{ lineId: "a", drop: 3 }] }).value.rows).toEqual([{ lineId: "a", drop: 3 }]);
    expect(readBookedRequest({ action: "drops", date: "2026-11-25", vanId: "v", rows: [{ lineId: "a", drop: 17 }] }).error).toBe("drop_limit");
    expect(readBookedRequest({ action: "drops", date: "bad", vanId: "v", rows: [{ lineId: "a", drop: 1 }] }).error).toBe("bad_request");
    expect(readBookedRequest({ action: "reschedule", lineIds: ["a", "a"], reason: " x " }).value).toEqual({ action: "reschedule", lineIds: ["a"], reason: "x" });
    expect(readBookedRequest({ action: "other" }).error).toBe("bad_request");
  });
});

const line = (orderId, n, over = {}) => ({ shop: SHOP, orderId, lineId: `L${n}`, title: `Item ${n}`, sku: `SKU${n}`, vendor: "Acme", quantity: 1, priceMinor: 10000, discountMinor: 0, currency: "GBP", lineStatusId: 4, deliveryOutcome: null, ...over });
const order = (n) => ({ shop: SHOP, orderId: O(n), name: `UD${3160 + n}`, postcode: `AB${n} 1CD`, createdAt: new Date(2026, 10, n), outstandingMinor: 0, lineStatusIds: [4] });
const booking = (n, over = {}) => ({ shop: SHOP, orderId: O(n), lineId: `L${n}`, partner: "CFS", date: "2026-11-25", vanId: "v1", driverId: "d1", drop: n, amPm: "AM", prebook: false, emailed: true, bookedByName: "Sam", ...over });

let db;
beforeEach(() => {
  db = {
    driver: table([{ id: "d1", shop: SHOP, name: "Driver1", active: true }]),
    van: table([{ id: "v1", shop: SHOP, name: "Van 1", driverId: "d1", active: true }, { id: "v2", shop: SHOP, name: "Van 2", driverId: null, active: true }]),
    deliverySlot: table(),
    deliveryHistory: table(),
    orderLine: table([line(O(1), 1), line(O(2), 2, { vendor: "Zed", deliveryOutcome: "confirmed" }), line(O(3), 3, { quantity: 2, discountMinor: 500 }), line(O(4), 4), line(O(5), 5)]),
    order: table([1, 2, 3, 4, 5].map(order)),
    deliveryBooking: table([booking(1), booking(2), booking(3, { amPm: "PM" }), booking(4, { date: "2026-11-26" }), booking(5, { prebook: true, vanId: null })]),
  };
});

describe("the Delivery Booked list", () => {
  it("groups by day and van, in drop order, with a total", async () => {
    const r = await listBooked(db, SHOP, { from: "2026-11-25", to: "2026-11-26", brand: null, q: "" });
    expect(r.summary).toEqual({ runs: 2, entries: 4 });
    expect(r.runs[0]).toMatchObject({ date: "2026-11-25", vanName: "Van 1", driverName: "Driver1", totalMinor: 10000 + 10000 + 19500 });
    expect(r.runs[0].rows.map((x) => [x.orderName, x.drop, x.amPm])).toEqual([["UD3161", 1, "AM"], ["UD3162", 2, "AM"], ["UD3163", 3, "PM"]]);
    expect(r.runs[0].rows[1]).toMatchObject({ delivery: "confirmed", deliveryType: "Free Door Delivery", postcode: "AB2 1CD" });
    expect(r.runs[1].date).toBe("2026-11-26");
  });
  it("leaves out pre-booked lines, other days, other brands and other searches", async () => {
    expect((await listBooked(db, SHOP, { from: "2026-11-25", to: "2026-11-25", brand: null, q: "" })).summary.entries).toBe(3);
    expect((await listBooked(db, SHOP, { from: "2026-11-25", to: "2026-11-25", brand: "Zed", q: "" })).summary.entries).toBe(1);
    expect((await listBooked(db, SHOP, { from: "2026-11-25", to: "2026-11-25", brand: null, q: "ab3" })).summary.entries).toBe(1);
  });
});

describe("changing drops", () => {
  const drops = () => Object.fromEntries(db.deliveryBooking.rows.filter((b) => b.date === "2026-11-25" && b.vanId === "v1").map((b) => [b.lineId, b.drop]));
  it("keeps the typed drop and moves the order in the way down, and logs it", async () => {
    const r = await saveDrops(db, { shop: SHOP, request: { date: "2026-11-25", vanId: "v1", rows: [{ lineId: "L3", drop: 1 }] }, actor });
    expect(r).toMatchObject({ ok: true, saved: 1, moved: 2 });
    expect(drops()).toEqual({ L1: 2, L2: 3, L3: 1 });
    expect(db.deliveryHistory.rows.map((h) => h.action)).toEqual(expect.arrayContaining(["moved"]));
  });
  it("refuses a line that is not on that run, and a drop above 16", async () => {
    expect((await saveDrops(db, { shop: SHOP, request: { date: "2026-11-25", vanId: "v1", rows: [{ lineId: "L4", drop: 1 }] }, actor })).code).toBe("no_lines");
    db.deliveryBooking.rows.push(booking(9, { drop: 16, lineId: "L9", orderId: O(9) }));
    expect((await saveDrops(db, { shop: SHOP, request: { date: "2026-11-25", vanId: "v1", rows: [{ lineId: "L1", drop: 16 }] }, actor })).code).toBe("drop_limit");
  });
  it("booking an order into a taken drop moves the others down", async () => {
    db.orderLine.rows.push(line(O(6), 6));
    db.order.rows.push(order(6));
    const r = await bulkBook(db, { shop: SHOP, request: { date: "2026-11-25", vanId: "v1", rows: [{ lineId: "L6", drop: 2, amPm: "AM" }], allowDuplicate: true }, actor, queueEmail: async () => ({ ok: true }) });
    expect(r).toMatchObject({ ok: true, shifted: 2 });
    expect(drops()).toEqual({ L1: 1, L2: 3, L3: 4, L6: 2 });
  });
});
