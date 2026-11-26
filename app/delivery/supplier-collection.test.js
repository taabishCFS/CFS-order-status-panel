import { beforeEach, describe, expect, it } from "vitest";
import { addCollection, deleteCollections, listCollections, readCollectionInput } from "./supplier-collection.server.js";

const SHOP = "s.myshopify.com";

function makeDb() {
  let seq = 0;
  const collections = [];
  const match = (row, where = {}) => Object.entries(where).every(([k, v]) => (v !== null && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
  return {
    collections,
    supplierCollection: {
      findMany: async ({ where } = {}) => collections.filter((r) => match(r, where)),
      findFirst: async ({ where } = {}) => collections.find((r) => match(r, where)) ?? null,
      create: async ({ data }) => { collections.push({ id: `c${++seq}`, createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, seq)), ...data }); },
      deleteMany: async ({ where }) => { const keep = collections.filter((r) => !match(r, where)); const count = collections.length - keep.length; collections.splice(0, collections.length, ...keep); return { count }; },
    },
    supplierContact: { findMany: async () => [{ shop: SHOP, brand: "Quirky Barn", address: "Besp Oak, Coventry" }] },
    orderLine: { findMany: async () => [{ vendor: "Quirky Barn" }, { vendor: "Maison" }, { vendor: null }] },
    van: { findMany: async () => [{ id: "v1", shop: SHOP, name: "Van 1", driverId: null, active: true }, { id: "v2", shop: SHOP, name: "Old", driverId: null, active: false }] },
    driver: { findMany: async () => [] },
    deliverySlot: { findMany: async () => [] },
  };
}

let db;
beforeEach(() => { db = makeDb(); });

describe("reading a request", () => {
  it("needs a brand, a van and a real date to add", () => {
    expect(readCollectionInput({ op: "add", brand: " Maison ", vanId: "v1", date: "2026-12-01" })).toEqual({ value: { op: "add", brand: "Maison", vanId: "v1", date: "2026-12-01" } });
    expect(readCollectionInput({ op: "add", brand: "", vanId: "v1", date: "2026-12-01" })).toEqual({ error: "no_brand" });
    expect(readCollectionInput({ op: "add", brand: "A", vanId: "", date: "2026-12-01" })).toEqual({ error: "no_van" });
    expect(readCollectionInput({ op: "add", brand: "A", vanId: "v1", date: "01-12-2026" })).toEqual({ error: "no_date" });
    expect(readCollectionInput({ op: "delete", ids: [] })).toEqual({ error: "nothing_selected" });
    expect(readCollectionInput({ op: "other" })).toEqual({ error: "bad_request" });
  });
});

describe("the list", () => {
  it("adds a collection, refuses an exact duplicate and an inactive van", async () => {
    const input = { brand: "Quirky Barn", vanId: "v1", date: "2026-12-01" };
    expect(await addCollection(db, SHOP, input, { name: "Sam" })).toEqual({ ok: true });
    expect(await addCollection(db, SHOP, input, { name: "Sam" })).toEqual({ ok: false, code: "duplicate" });
    expect(await addCollection(db, SHOP, { ...input, vanId: "v2" }, { name: "Sam" })).toEqual({ ok: false, code: "no_van" });
    expect(await addCollection(db, SHOP, { ...input, date: "2026-12-02" }, { name: "Sam" })).toEqual({ ok: true });
  });
  it("lists newest first with the supplier address, van name and a running number", async () => {
    await addCollection(db, SHOP, { brand: "Maison", vanId: "v1", date: "2026-12-01" }, { name: "Sam" });
    await addCollection(db, SHOP, { brand: "Quirky Barn", vanId: "v1", date: "2026-12-02" }, { name: "Sam" });
    const list = await listCollections(db, SHOP, 1);
    expect(list.rows).toEqual([
      { id: "c2", number: 2, brand: "Quirky Barn", address: "Besp Oak, Coventry", van: "Van 1", date: "2026-12-02" },
      { id: "c1", number: 1, brand: "Maison", address: "", van: "Van 1", date: "2026-12-01" },
    ]);
    expect(list).toMatchObject({ total: 2, page: 1, pageCount: 1, brands: ["Maison", "Quirky Barn", "Unmapped"], vans: [{ id: "v1", name: "Van 1" }] });
  });
  it("deletes the ticked rows", async () => {
    await addCollection(db, SHOP, { brand: "Maison", vanId: "v1", date: "2026-12-01" }, { name: "Sam" });
    await addCollection(db, SHOP, { brand: "Maison", vanId: "v1", date: "2026-12-02" }, { name: "Sam" });
    expect(await deleteCollections(db, SHOP, ["c1"])).toEqual({ ok: true, deleted: 1 });
    expect((await listCollections(db, SHOP)).total).toBe(1);
  });
});
