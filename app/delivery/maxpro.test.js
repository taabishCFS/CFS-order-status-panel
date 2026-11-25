import { beforeEach, describe, expect, it } from "vitest";
import { listMaxpro, maxproRowsFor } from "./maxpro.server.js";

const SHOP = "s.myshopify.com";
const O = (n) => `gid://shopify/Order/${n}`;

function table(rows) {
  const match = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => (v !== null && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
  return { findMany: async ({ where } = {}) => rows.filter((r) => match(r, where)) };
}
const order = (n, over = {}) => ({ shop: SHOP, orderId: O(n), name: `#${1000 + n}`, createdAt: new Date(2026, 10, n), customerName: `Cust ${n}`, email: `c${n}@x.com`, phone: `07${n}`, postcode: `AB${n} 1CD`, outstandingMinor: 0, cancelledAt: null, archivedAt: null, shippingAddress: { address1: `${n} High St`, city: "Leicester", zip: `AB${n} 1CD` }, ...over });
const line = (n, k, over = {}) => ({ shop: SHOP, orderId: O(n), lineId: `L${n}${k}`, title: "Bed", vendor: "Acme", lineStatusId: 4, orderArchived: false, ...over });

let db;
beforeEach(() => {
  db = {
    order: table([order(1), order(2, { outstandingMinor: 500 }), order(3), order(4), order(5), order(6, { cancelledAt: new Date() }), order(7)]),
    orderLine: table([
      line(1, 1), line(1, 2, { lineStatusId: 9, vendor: "Zed" }),
      line(2, 1),
      line(3, 1, { lineStatusId: 10 }), line(3, 2),
      line(4, 1), line(4, 2, { title: "White Glove [svc:white_glove]", lineStatusId: 7 }),
      line(5, 1, { lineStatusId: 6 }),
      line(6, 1),
      line(7, 1),
    ]),
    deliveryBooking: table([{ shop: SHOP, orderId: O(7), lineId: "L71", partner: "CFS", date: "2026-11-30", prebook: false }]),
  };
});

const names = (r) => r.rows.map((x) => x.orderName);

describe("the Maxpro list", () => {
  it("lists paid orders with a deliverable line; leaves out owing, restricted-status, cancelled and booked ones", async () => {
    const r = await listMaxpro(db, SHOP, { q: "", brand: null, whiteGlove: false, all: false, page: 1 });
    expect(names(r)).toEqual(["#1001"]);
    expect(r.rows[0]).toMatchObject({ deliverable: 1, brands: ["Acme", "Zed"], client: "Cust 1" });
  });
  it("keeps a carrier-marked or pre-booked line on only when it is not booked for a date", async () => {
    db.deliveryBooking = table([{ shop: SHOP, orderId: O(1), lineId: "L11", partner: "TNT", date: null, prebook: false }]);
    expect(names(await listMaxpro(db, SHOP, { q: "", brand: null, whiteGlove: false, all: false, page: 1 }))).toEqual(["#1007"]);
    db.deliveryBooking = table([{ shop: SHOP, orderId: O(1), lineId: "L11", partner: "CFS", date: "2026-12-01", prebook: true }]);
    expect(names(await listMaxpro(db, SHOP, { q: "", brand: null, whiteGlove: false, all: false, page: 1 }))).toEqual(["#1007", "#1001"]);
  });
  it("shows White Glove orders only on the White Glove list", async () => {
    expect(names(await listMaxpro(db, SHOP, { q: "", brand: null, whiteGlove: true, all: false, page: 1 }))).toEqual(["#1004"]);
  });
  it("filters by brand and by search", async () => {
    db.deliveryBooking = table([]);
    expect(names(await listMaxpro(db, SHOP, { q: "", brand: "Zed", whiteGlove: false, all: false, page: 1 }))).toEqual(["#1001"]);
    expect(names(await listMaxpro(db, SHOP, { q: "cust 7", brand: null, whiteGlove: false, all: false, page: 1 }))).toEqual(["#1007"]);
  });
  it("gives the rows for an export in list order, ignoring ids that are not listed", async () => {
    db.deliveryBooking = table([]);
    const rows = await maxproRowsFor(db, SHOP, [O(1), O(2), O(7)]);
    expect(rows.map((r) => r.orderName)).toEqual(["#1007", "#1001"]);
  });
});
