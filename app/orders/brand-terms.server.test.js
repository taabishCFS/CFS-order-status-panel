import { describe, expect, it, vi } from "vitest";
import { listBrandTerms, saveBrandTerms } from "./brand-terms.server.js";

const fakeDb = ({ vendors = [], saved = [] } = {}) => ({
  orderLine: { findMany: vi.fn(async () => vendors.map((vendor) => ({ vendor }))) },
  brandTerms: { findMany: vi.fn(async () => saved), upsert: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })) },
});

describe("listBrandTerms", () => {
  it("lists every brand with its saved terms, A to Z, and null where none is set", async () => {
    const db = fakeDb({ vendors: ["Duke Beds", "Actona"], saved: [{ brand: "Actona", terms: "credit" }] });
    expect(await listBrandTerms(db, "s")).toEqual([{ brand: "Actona", terms: "credit" }, { brand: "Duke Beds", terms: null }]);
    expect(db.brandTerms.findMany).toHaveBeenCalledWith({ where: { shop: "s" } });
  });
  it("keeps a saved brand that has no orders any more", async () => {
    const db = fakeDb({ vendors: [], saved: [{ brand: "Old Brand", terms: "proforma" }] });
    expect(await listBrandTerms(db, "s")).toEqual([{ brand: "Old Brand", terms: "proforma" }]);
  });
});

describe("saveBrandTerms", () => {
  it("saves credit or proforma with who set it, for this shop only", async () => {
    const db = fakeDb();
    expect(await saveBrandTerms(db, "s", { brand: " Actona ", terms: "credit" }, { id: "9", name: "Sam" })).toEqual({ ok: true });
    expect(db.brandTerms.upsert).toHaveBeenCalledWith({
      where: { shop_brand: { shop: "s", brand: "Actona" } },
      create: { shop: "s", brand: "Actona", terms: "credit", updatedById: "9", updatedByName: "Sam" },
      update: { terms: "credit", updatedById: "9", updatedByName: "Sam" },
    });
  });
  it("clears the setting when terms is null", async () => {
    const db = fakeDb();
    expect(await saveBrandTerms(db, "s", { brand: "Actona", terms: null }, null)).toEqual({ ok: true });
    expect(db.brandTerms.deleteMany).toHaveBeenCalledWith({ where: { shop: "s", brand: "Actona" } });
    expect(db.brandTerms.upsert).not.toHaveBeenCalled();
  });
  it("refuses a missing brand, a long brand and an unknown term", async () => {
    const db = fakeDb();
    for (const input of [{ brand: "", terms: "credit" }, { brand: "x".repeat(201), terms: "credit" }, { brand: "A", terms: "cash" }, { brand: 5, terms: "credit" }]) {
      expect(await saveBrandTerms(db, "s", input, null)).toEqual({ ok: false, error: "bad_request" });
    }
    expect(db.brandTerms.upsert).not.toHaveBeenCalled();
  });
});
