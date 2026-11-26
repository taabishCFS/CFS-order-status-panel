import { describe, expect, it } from "vitest";
import { addToPayList, listPayList, readPayListInput, removeFromPayList } from "./pay-list.server.js";

const SHOP = "s.myshopify.com";
const L = (n) => `gid://shopify/LineItem/${n}`;
const O = (n) => `gid://shopify/Order/${n}`;
const kim = { id: "1", name: "Kim" };
const sam = { id: "2", name: "Sam" };

function makeDb(lines, orders) {
  const rows = [];
  const hit = (w = {}) => (r) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "in" in v ? v.in.includes(r[k]) : r[k] === v));
  return {
    rows,
    orderLine: { findMany: async ({ where }) => lines.filter(hit(where)) },
    order: { findMany: async ({ where }) => orders.filter(hit(where)) },
    payListLine: {
      findMany: async ({ where }) => rows.filter(hit(where)).map((r) => ({ ...r })),
      create: async ({ data }) => { rows.push({ createdAt: new Date(2026, 10, 1, 0, 0, rows.length), ...data }); },
      deleteMany: async ({ where }) => { const keep = rows.filter((r) => !hit(where)(r)); const count = rows.length - keep.length; rows.splice(0, rows.length, ...keep); return { count }; },
    },
    lineSupplierInvoice: { findMany: async () => [] },
    linePayment: { findMany: async () => [] },
  };
}
const line = (n) => ({ shop: SHOP, orderId: O(n), lineId: L(n), vendor: "Duke Beds", title: `Bed ${n}`, variantTitle: null, sku: null, variantId: null, quantity: 1, priceMinor: 1000, discountMinor: 0, lineStatusId: 4, stockedDate: null, orderCreatedAt: new Date("2026-11-20T10:00:00Z") });
const order = (n) => ({ shop: SHOP, orderId: O(n), name: `#CFS${n}` });

describe("reading a request", () => {
  it("needs valid line ids", () => {
    expect(readPayListInput({ op: "add", lineIds: [L(1), L(1), "x"] })).toEqual({ value: { op: "add", lineIds: [L(1)] } });
    expect(readPayListInput({ op: "remove", lineIds: [] })).toEqual({ error: "nothing_selected" });
    expect(readPayListInput({ op: "nope", lineIds: [L(1)] })).toEqual({ error: "bad_request" });
  });
});

describe("the list", () => {
  it("adds once, keeps each person's own list and removes only their own", async () => {
    const db = makeDb([line(1), line(2), line(3)], [order(1), order(2), order(3)]);
    expect(await addToPayList(db, SHOP, [L(1), L(2), L(99)], kim)).toEqual({ ok: true, added: 2, already: 0 });
    expect(await addToPayList(db, SHOP, [L(2), L(3)], sam)).toEqual({ ok: true, added: 1, already: 1 });
    expect((await listPayList(db, undefined, SHOP, kim)).rows.map((r) => r.lineId)).toEqual([L(2), L(1)]);
    expect((await listPayList(db, undefined, SHOP, sam)).rows.map((r) => r.lineId)).toEqual([L(3)]);
    expect(await removeFromPayList(db, SHOP, [L(3)], kim)).toEqual({ ok: true, removed: 0 });
    expect(await removeFromPayList(db, SHOP, [L(1)], kim)).toEqual({ ok: true, removed: 1 });
    expect((await listPayList(db, undefined, SHOP, kim, { q: "cfs2" })).total).toBe(1);
  });
});
