import { describe, expect, it } from "vitest";
import { addressColumns, matchesSearch, maxproRow, orderIsWhiteGlove, orderWiseCsv, parseMaxproParams, productWiseCsv } from "./maxpro-rules.js";

const order = {
  orderId: "gid://shopify/Order/1", name: "#1038", createdAt: new Date("2026-11-03T10:00:00Z"), customerName: "Alex Customer", email: "a@x.com", phone: "0777", postcode: "LE1 3LR",
  shippingAddress: { name: "Alex Customer", address1: "12 High St", address2: "Flat 2", city: "Leicester", province: "Leicestershire", countryCode: "GB", zip: "LE1 3LR" },
};
const lines = [{ lineId: "a", vendor: "Actona", lineStatusId: 4 }, { lineId: "b", vendor: null, lineStatusId: 14 }];

describe("parseMaxproParams", () => {
  it("reads search, brand, white glove, all and page", () => {
    expect(parseMaxproParams(new URLSearchParams("q=ab&brand=X&wg=1&all=1&page=3"))).toEqual({ q: "ab", brand: "X", whiteGlove: true, all: true, page: 3 });
    expect(parseMaxproParams(new URLSearchParams("page=-2"))).toMatchObject({ page: 1, whiteGlove: false, all: false, brand: null });
  });
});

describe("matchesSearch / orderIsWhiteGlove", () => {
  it("matches order number, name, email, phone and postcode", () => {
    for (const q of ["1038", "#1038", "alex", "a@x", "0777", "le1"]) expect(matchesSearch(q, order)).toBe(true);
    expect(matchesSearch("zzz", order)).toBe(false);
    expect(matchesSearch("", order)).toBe(true);
  });
  it("spots the White Glove service line", () => {
    expect(orderIsWhiteGlove(["Bed", "White Glove [svc:white_glove]"])).toBe(true);
    expect(orderIsWhiteGlove(["Bed"])).toBe(false);
  });
});

describe("addressColumns", () => {
  it("splits into the street and the rest", () => {
    expect(addressColumns(order.shippingAddress)).toEqual({ address1: "12 High St", address2: "Flat 2, Leicester, Leicestershire, GB, LE1 3LR" });
  });
});

describe("maxproRow and the two files", () => {
  const row = { ...maxproRow(order, lines), deliverable: 2 };
  it("builds the page row", () => {
    expect(row).toMatchObject({ orderName: "#1038", date: "03/11/2026", client: "Alex Customer", contact: "0777", centre: "Choice Furniture", windowStart: "7:30", windowEnd: "16:00", duration: "15", brands: ["Actona", "Unmapped"] });
  });
  it("order wise: one row per order with brands", () => {
    const [head, first] = orderWiseCsv([row]).slice(1).split("\r\n");
    expect(head).toBe("S.No.,Order No,Date of Order,Address 1,Address 2,Capacity,Volume,Distribution CentreName,Drop Window Start,Drop Window End,Drop Duration,Client Name,Contact Number,Order Date From,Order Date To,Brands");
    expect(first).toBe('1,#1038,03/11/2026,12 High St,"Flat 2, Leicester, Leicestershire, GB, LE1 3LR",,,Choice Furniture,7:30,16:00,15,Alex Customer,0777,03/11/2026,--,Actona | Unmapped | ');
  });
  it("product wise: one row per deliverable line, numbered, no brands column", () => {
    const rows = productWiseCsv([row, { ...row, orderName: "#1039", deliverable: 1 }]).slice(1).split("\r\n");
    expect(rows).toHaveLength(4);
    expect(rows[1].startsWith("1,#1038")).toBe(true);
    expect(rows[3].startsWith("3,#1039")).toBe(true);
    expect(rows[0].endsWith("Order Date To")).toBe(true);
  });
});
