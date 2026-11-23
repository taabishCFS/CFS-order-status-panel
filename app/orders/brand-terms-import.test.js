import { describe, expect, it, vi } from "vitest";
import { MAX_IMPORT_ROWS, importBrandTerms, normaliseTerms } from "./brand-terms.server.js";
import { buildReport } from "./report-query.server.js";
import { BRAND_TERMS_HEADERS, brandTermsCsv, parseReportParams, reportFilename } from "./report-rules.js";

function fakeDb({ vendors = [], saved = [] } = {}) {
  const ops = [];
  return {
    ops,
    orderLine: { findMany: vi.fn(async () => vendors.map((vendor) => ({ vendor }))) },
    brandTerms: {
      findMany: vi.fn(async () => saved),
      upsert: vi.fn((a) => ({ kind: "upsert", a })),
      deleteMany: vi.fn((a) => ({ kind: "delete", a })),
    },
    $transaction: vi.fn(async (list) => { ops.push(...list); return list; }),
  };
}

describe("normaliseTerms", () => {
  it("understands the ways staff type the terms", () => {
    for (const t of ["credit", " Credit ", "CREDIT"]) expect(normaliseTerms(t)).toBe("credit");
    for (const t of ["proforma", "Pro-forma", "pro forma", "PRO-FORMA"]) expect(normaliseTerms(t)).toBe("proforma");
    for (const t of ["clear", "None", "not set", "Not Set"]) expect(normaliseTerms(t)).toBe("clear");
  });
  it("treats blank as leave alone and anything else as not understood", () => {
    expect(normaliseTerms("")).toBe("skip");
    expect(normaliseTerms("   ")).toBe("skip");
    expect(normaliseTerms(undefined)).toBe("skip");
    expect(normaliseTerms("cash")).toBeNull();
  });
});

describe("importBrandTerms", () => {
  const staff = { id: "9", name: "Sam" };
  it("saves credit and pro-forma, clears on Clear, leaves blanks alone", async () => {
    const db = fakeDb();
    const r = await importBrandTerms(db, "s", [
      { line: 2, brand: " Actona ", terms: "Credit" },
      { line: 3, brand: "Duke Beds", terms: "Pro-forma" },
      { line: 4, brand: "Old", terms: "Clear" },
      { line: 5, brand: "Blank", terms: "" },
    ], staff);
    expect(r).toEqual({ ok: true, saved: 2, cleared: 1, unchanged: 1, rejected: [], rejectedCount: 0 });
    expect(db.brandTerms.upsert).toHaveBeenCalledWith({
      where: { shop_brand: { shop: "s", brand: "Actona" } },
      create: { shop: "s", brand: "Actona", terms: "credit", updatedById: "9", updatedByName: "Sam" },
      update: { terms: "credit", updatedById: "9", updatedByName: "Sam" },
    });
    expect(db.brandTerms.deleteMany).toHaveBeenCalledWith({ where: { shop: "s", brand: "Old" } });
  });
  it("rejects rows it cannot use, with the line number, and still saves the rest", async () => {
    const db = fakeDb();
    const r = await importBrandTerms(db, "s", [
      { line: 2, brand: "Actona", terms: "cash" },
      { line: 3, brand: "", terms: "credit" },
      { line: 4, brand: "x".repeat(201), terms: "credit" },
      { line: 5, brand: "Good", terms: "credit" },
    ], null);
    expect(r.saved).toBe(1);
    expect(r.rejectedCount).toBe(3);
    expect(r.rejected.map((x) => x.line)).toEqual([2, 3, 4]);
    expect(r.rejected[0].reason).toContain("not Credit, Pro-forma or Clear");
  });
  it("lets the last row win when a brand is listed twice", async () => {
    const db = fakeDb();
    const r = await importBrandTerms(db, "s", [{ line: 2, brand: "A", terms: "credit" }, { line: 3, brand: "A", terms: "proforma" }], null);
    expect(r.saved).toBe(1);
    expect(db.brandTerms.upsert).toHaveBeenCalledTimes(2 - 1);
    expect(db.brandTerms.upsert.mock.calls[0][0].create.terms).toBe("proforma");
  });
  it("writes a big sheet in chunks and reports at most 50 rejections", async () => {
    const db = fakeDb();
    const rows = Array.from({ length: 1000 }, (_, i) => ({ line: i + 2, brand: `B${i}`, terms: i < 960 ? "credit" : "cash" }));
    const r = await importBrandTerms(db, "s", rows, null);
    expect(r.saved).toBe(960);
    expect(r.rejectedCount).toBe(40);
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
  it("refuses an empty list, a non-list and too many rows", async () => {
    const db = fakeDb();
    expect(await importBrandTerms(db, "s", [], null)).toEqual({ ok: false, error: "bad_request" });
    expect(await importBrandTerms(db, "s", "x", null)).toEqual({ ok: false, error: "bad_request" });
    expect(await importBrandTerms(db, "s", Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ line: i, brand: `B${i}`, terms: "credit" })), null)).toEqual({ ok: false, error: "too_many_rows" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("brand terms download", () => {
  it("writes every brand with Credit, Pro-forma or blank", () => {
    const csv = brandTermsCsv([{ brand: "Actona", terms: "credit" }, { brand: "Duke, Beds", terms: "proforma" }, { brand: "New", terms: null }]);
    expect(csv).toBe(`${BRAND_TERMS_HEADERS.join(",")}\r\nActona,Credit\r\n"Duke, Beds",Pro-forma\r\nNew,\r\n`);
  });
  it("is a known report without dates, named brand_terms.csv", () => {
    expect(parseReportParams("brandterms", () => undefined)).toEqual({ range: undefined, terms: undefined });
    expect(reportFilename("brandterms")).toBe("brand_terms.csv");
  });
  it("builds from the brand list", async () => {
    const db = fakeDb({ vendors: ["Duke Beds", "Actona"], saved: [{ brand: "Actona", terms: "credit" }] });
    const r = await buildReport({ db, shop: "s", kind: "brandterms" });
    expect(r.count).toBe(2);
    expect(r.csv).toBe("Brand,Terms\r\nActona,Credit\r\nDuke Beds,\r\n");
  });
});
