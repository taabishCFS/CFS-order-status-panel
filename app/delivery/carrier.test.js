import { beforeEach, describe, expect, it } from "vitest";
import { carrierRows, listCarrier } from "./carrier.server.js";
import { carrierCsv, carrierPrintHtml, parseCarrierParams, statusWanted, CARRIERS } from "./carrier-rules.js";

const SHOP = "s.myshopify.com";
const O = (n) => `gid://shopify/Order/${n}`;

function table(rows) {
  const match = (row, where = {}) => Object.entries(where).every(([k, v]) => (v !== null && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
  return { findMany: async ({ where } = {}) => rows.filter((r) => match(r, where)) };
}
const order = (n, over = {}) => ({ shop: SHOP, orderId: O(n), name: `#${1000 + n}`, createdAt: new Date(Date.UTC(2026, 10, n, 12)), email: `c${n}@x.com`, postcode: `AB${n} 1CD`, cancelledAt: null, ...over });
const line = (n, over = {}) => ({ shop: SHOP, orderId: O(n), lineId: `L${n}`, title: "Bed", sku: `S${n}`, vendor: "Acme", quantity: 2, priceMinor: 10000, discountMinor: 500, lineStatusId: 4, expectedDate: "2026-12-01", deliveryOutcome: null, ...over });
const booking = (n, over = {}) => ({ shop: SHOP, orderId: O(n), lineId: `L${n}`, partner: "TNT", date: null, vanId: null, prebook: false, emailed: false, ...over });

let db;
beforeEach(() => {
  db = {
    van: table([{ id: "v1", shop: SHOP, name: "Van 1", driverId: null, active: true }]),
    driver: table([]),
    deliverySlot: table([]),
    order: table([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => order(n, n === 8 ? { outstandingMinor: 5000 } : {}))),
    orderLine: table([
      line(1), line(2, { lineStatusId: 6 }), line(3, { vendor: "Zed" }), line(4, { lineStatusId: 36 }),
      line(5, { lineStatusId: 5 }), line(6, { title: "White Glove [svc:white_glove]" }),
      { ...line(6, { lineId: "L6b", title: "Wardrobe" }) },
      line(7, { lineStatusId: 14, stockedDate: "2026-11-05" }), line(8, { lineStatusId: 4 }), line(9, { lineStatusId: 4 }),
    ]),
    deliveryBooking: table([
      booking(1), booking(2), booking(3, { partner: "Pallet" }),
      booking(5, { partner: "CFS", date: "2026-11-30", vanId: "v1", emailed: true }),
      booking(7, { partner: "CFS", date: "2026-12-02", prebook: true }), booking(9, { partner: "CFS", date: "2026-12-03", vanId: "v1" }),
    ]),
    deliveryHistory: table([{ shop: SHOP, orderId: O(7), lineId: "L7", action: "prebooked", partner: "CFS", createdAt: new Date(Date.UTC(2026, 10, 7)) }, { shop: SHOP, orderId: O(7), lineId: "L7", action: "rescheduled", partner: "CFS", createdAt: new Date(Date.UTC(2026, 10, 9)) }]),
    lineChase: table([{ shop: SHOP, lineId: "L1", lastChasedAt: new Date(Date.UTC(2026, 10, 20)) }]),
  };
});
const base = { key: "tnt", q: "", brand: null, van: null, from: "", to: "", all: false, page: 1 };
const names = async (p) => (await carrierRows(db, SHOP, { ...base, ...p })).map((r) => r.orderName);

describe("which lines each page lists", () => {
  it("TNT: lines marked TNT in a TNT status (completed ones are left out)", async () => {
    expect(await names({})).toEqual(["#1001"]);
  });
  it("Pallet: lines marked Pallet in any status except finished ones", async () => {
    expect(await names({ key: "pallet" })).toEqual(["#1003"]);
  });
  it("DHD: lines in DHD with Supplier status", async () => {
    expect(await names({ key: "dhd" })).toEqual(["#1004"]);
  });
  it("White Glove: only orders that bought the White Glove service", async () => {
    expect((await names({ key: "white-glove" })).sort()).toEqual(["#1006", "#1006"]);
  });
  it("Allocated + Booked: part-order-in-stock lines booked on a van with a date", async () => {
    const [r] = await carrierRows(db, SHOP, { ...base, key: "allocated" });
    expect(r).toMatchObject({ orderName: "#1005", van: "Van 1", date: "2026-11-30", emailed: true });
    expect(await names({ key: "allocated", van: "v1", from: "2026-12-01" })).toEqual([]);
  });
});

describe("Instock Delivery Not Booked", () => {
  it("lists in-stock lines without a booked date or carrier (a prebook still counts), with balance and booking status", async () => {
    const rows = await carrierRows(db, SHOP, { ...base, key: "instock" });
    expect(rows.map((r) => r.orderName).sort()).toEqual(["#1006", "#1006", "#1007", "#1008"]);
    const seven = rows.find((r) => r.orderName === "#1007");
    expect(seven).toMatchObject({ bookingStatus: "Rescheduled", stockedDate: "2026-11-05", allStatuses: [14] });
    expect(rows.find((r) => r.orderName === "#1008")).toMatchObject({ balanceMinor: 5000 });
  });
  it("filters by payment and by ticked lines, and writes the short CSV", async () => {
    const part = await carrierRows(db, SHOP, { ...base, key: "instock", pay: "PART" });
    expect(part.map((r) => r.orderName)).toEqual(["#1008"]);
    expect((await carrierRows(db, SHOP, { ...base, key: "instock", pay: "FULL" })).length).toBe(3);
    expect((await carrierRows(db, SHOP, { ...base, key: "instock", lines: ["L7"] })).map((r) => r.orderName)).toEqual(["#1007"]);
    const csv = carrierCsv(part, "instock").slice(1).split("\r\n");
    expect(csv[0]).toBe("Order Date,Order Number,Brand Name,Item,Code,Qty,Balance");
    expect(csv[1]).toBe("08/11/2026,#1008,Acme,Bed,S8,2,50.00");
  });
});

describe("filters, page and file", () => {
  it("filters by brand and search, and fills the chase-up and expected dates", async () => {
    expect(await names({ key: "pallet", brand: "Zed" })).toEqual(["#1003"]);
    expect(await names({ q: "zzz" })).toEqual([]);
    const [r] = await carrierRows(db, SHOP, base);
    expect(r).toMatchObject({ expectedDate: "2026-12-01", custDate: "2026-12-01", amountMinor: 19500 });
    expect(r.lastChaseDate).toBe("2026-11-20T00:00:00.000Z");
  });
  it("lists the vans for the filter", async () => {
    expect((await listCarrier(db, SHOP, base)).vans).toEqual([{ id: "v1", name: "Van 1" }]);
  });
  it("reads the parameters and status rules", () => {
    expect(parseCarrierParams(new URLSearchParams("key=pallet&from=2026-12-05&to=2026-12-01&page=2"))).toMatchObject({ key: "pallet", from: "2026-12-01", to: "2026-12-05", page: 2 });
    expect(parseCarrierParams(new URLSearchParams("key=zzz")).key).toBe("tnt");
    expect(statusWanted(CARRIERS.pallet, 6)).toBe(false);
    expect(statusWanted(CARRIERS.pallet, 4)).toBe(true);
  });
  it("adds driver, drop, slot and delivery type for booked lines, and prints every column", async () => {
    const rows = await carrierRows(db, SHOP, { ...base, key: "allocated" });
    expect(rows[0]).toMatchObject({ driver: "", drop: null, slot: "", deliveryType: "Free Door Delivery" });
    const html = carrierPrintHtml("Allocated", [{ ...rows[0], product: "A <b>", size: "6 x Chairs", driver: "Sam", drop: 3, slot: "AM", confirmed: "confirmed" }], "2026-11-26");
    expect(html).toContain("A &lt;b&gt;");
    expect(html).toContain("<small>6 x Chairs</small>");
    expect(html).toContain("Drop 3");
    expect(html).toContain("Confirmed");
    expect(html).toContain("size:A4 landscape");
  });
  it("writes the CSV with the shared columns", async () => {
    const out = carrierCsv(await carrierRows(db, SHOP, base)).slice(1).split("\r\n");
    expect(out[0]).toBe("Order No,Brand,Product Name,Qty,Order Date,Expected Delivery Date,Last Chaseup Date,Delivery Date,Delivery Booked,Delivery Confirmed?,Order Status");
    expect(out[1]).toBe("#1001,Acme,Bed,2,01/11/2026,01/12/2026,20/11/2026,,No,Not Confirmed,In Stock");
  });
});
