import { describe, expect, it, vi } from "vitest";
import { FREE_STOCK_HEADERS, freeStockCsv, freeStockSampleCsv, normaliseFreeStock, parseCostMinor, warehouseCodeOf } from "./free-stock-rules.js";
import { MAX_IMPORT_ROWS, addFreeStock, allFreeStock, deleteFreeStock, importFreeStock, listFreeStock, updateFreeStock } from "./free-stock.server.js";
import { buildReport } from "./report-query.server.js";
import { parseReportParams, reportFilename } from "./report-rules.js";

const good = { brand: "Actona", productCode: "ACT-1", qty: "2", productName: "Bed", cost: "£125.50" };
const staff = { id: "u1", name: "Sam" };

describe("parseCostMinor", () => {
  it("reads money text as pence, blank as null and nonsense as bad", () => {
    expect(parseCostMinor("12.50")).toBe(1250);
    expect(parseCostMinor("£1,250.5")).toBe(125050);
    expect(parseCostMinor("7")).toBe(700);
    expect(parseCostMinor("")).toBeNull();
    expect(parseCostMinor(undefined)).toBeNull();
    for (const bad of ["abc", "-3", "1.234", "12,5x"]) expect(parseCostMinor(bad)).toBe("bad");
  });
});

describe("normaliseFreeStock", () => {
  it("accepts a good row, defaulting the type and the name", () => {
    const r = normaliseFreeStock({ ...good, productName: "" });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ itemType: "freeStock", brand: "Actona", productCode: "ACT-1", productName: "ACT-1", qty: 2, costMinor: 12550, remarks: null });
  });
  it("rejects a missing brand or code and a bad quantity or cost, saying why", () => {
    expect(normaliseFreeStock({ ...good, brand: " " })).toMatchObject({ ok: false, reason: expect.stringContaining("brand") });
    expect(normaliseFreeStock({ ...good, productCode: "" })).toMatchObject({ ok: false, reason: expect.stringContaining("product code") });
    for (const qty of ["0", "-1", "1.5", "abc", "", "100001"]) expect(normaliseFreeStock({ ...good, qty }).ok).toBe(false);
    expect(normaliseFreeStock({ ...good, cost: "lots" })).toMatchObject({ ok: false, reason: expect.stringContaining("cost") });
  });
  it("shows FSS plus the running number when no warehouse code was typed", () => {
    expect(warehouseCodeOf({ warehouseCode: null, seq: 17 })).toBe("FSS17");
    expect(warehouseCodeOf({ warehouseCode: "BAY-4", seq: 17 })).toBe("BAY-4");
  });
});

describe("free stock spreadsheets", () => {
  it("the sample has the headings and one example row", () => {
    const lines = freeStockSampleCsv().trim().split("\r\n");
    expect(lines[0]).toBe(FREE_STOCK_HEADERS.join(","));
    expect(lines).toHaveLength(2);
  });
  it("the list gives cost in pounds and the shown warehouse code", () => {
    const row = { itemType: "freeStock", sourceOrder: "1038", brand: "Actona", productName: "Bed", qty: 2, productCode: "A1", warehouseCode: null, seq: 5, rma: null, remarks: "boxed", costMinor: 12550, creditFoc: null, status: null, collection: null };
    expect(freeStockCsv([row]).trim().split("\r\n")[1]).toBe("freeStock,1038,Actona,Bed,2,A1,FSS5,,boxed,125.50,,,");
  });
  it("is a hidden download kind with no dates and its own file names", () => {
    for (const kind of ["freestock", "freestocksample"]) expect(parseReportParams(kind, () => undefined)).toEqual({ range: undefined, terms: undefined });
    expect(reportFilename("freestock")).toBe("free_stock.csv");
    expect(reportFilename("freestocksample")).toBe("free_stock_sample.csv");
  });
});

function fakeDb(rows = [], allocated = []) {
  const calls = {};
  return {
    calls,
    freeStockAllocation: {
      findMany: vi.fn(async () => allocated),
      count: vi.fn(async () => allocated.length),
    },
    freeStock: {
      count: vi.fn(async (a) => { calls.count = a; return rows.length; }),
      findMany: vi.fn(async (a) => { calls.find = [...(calls.find ?? []), a]; return a.distinct ? [{ itemType: "freeStock" }, { itemType: "SBTS" }] : rows; }),
      create: vi.fn(async (a) => { calls.create = a; return { id: "new1" }; }),
      createMany: vi.fn(async (a) => { calls.createMany = [...(calls.createMany ?? []), a]; }),
      updateMany: vi.fn(async (a) => { calls.update = a; return { count: rows.length ? 1 : 0 }; }),
      deleteMany: vi.fn(async (a) => { calls.remove = a; return { count: rows.length ? 1 : 0 }; }),
    },
  };
}
const stored = (i) => ({ id: `f${i}`, itemType: "freeStock", sourceOrder: null, brand: "Actona", productName: `Bed ${i}`, qty: 3, productCode: `A${i}`, warehouseCode: null, seq: i, rma: null, remarks: null, costMinor: 1000, creditFoc: null, status: null, collection: null, addedByName: "Sam", createdAt: new Date() });

describe("listFreeStock", () => {
  it("shows only what is in stock by default, newest first, and lists the item types", async () => {
    const db = fakeDb([stored(1)]);
    const r = await listFreeStock(db, "s", {});
    expect(db.calls.count.where).toEqual({ shop: "s", qty: { gt: 0 } });
    expect(r).toMatchObject({ total: 1, page: 1, pageCount: 1, itemTypes: ["SBTS", "freeStock"] });
    expect(r.items[0]).toMatchObject({ id: "f1", warehouseCode: "FSS1", cost: "10.00" });
    expect(db.calls.find.at(-1).orderBy[0]).toEqual({ createdAt: "desc" });
  });
  it("filters used-up items, by type and by a search over several fields", async () => {
    const db = fakeDb([]);
    await listFreeStock(db, "s", { view: "used", itemType: "SBTS", search: " duke " });
    expect(db.calls.count.where.qty).toEqual({ lte: 0 });
    expect(db.calls.count.where.itemType).toBe("SBTS");
    expect(db.calls.count.where.OR).toContainEqual({ productCode: { contains: "duke", mode: "insensitive" } });
  });
  it("keeps an out-of-range page inside the pages", async () => {
    const db = fakeDb(Array.from({ length: 120 }, (_, i) => stored(i)));
    db.freeStock.count = vi.fn(async () => 120);
    const r = await listFreeStock(db, "s", { page: 99 });
    expect(r).toMatchObject({ page: 3, pageCount: 3 });
  });
});

describe("addFreeStock and importFreeStock", () => {
  it("adds one record stamped with who added it", async () => {
    const db = fakeDb();
    expect(await addFreeStock(db, "s", good, staff)).toEqual({ ok: true, id: "new1" });
    expect(db.calls.create.data).toMatchObject({ shop: "s", brand: "Actona", qty: 2, costMinor: 12550, addedById: "u1", addedByName: "Sam" });
  });
  it("refuses a bad record with the reason", async () => {
    const r = await addFreeStock(fakeDb(), "s", { ...good, qty: "0" }, staff);
    expect(r).toMatchObject({ ok: false, error: "bad_request" });
    expect(r.message).toContain("quantity");
  });
  it("imports the good rows, skips the bad ones with their line numbers, and still saves", async () => {
    const db = fakeDb();
    const r = await importFreeStock(db, "s", [{ line: 2, ...good }, { line: 3, ...good, brand: "" }, { line: 4, ...good, productCode: "B2" }], staff);
    expect(r).toMatchObject({ ok: true, added: 2, rejectedCount: 1 });
    expect(r.rejected[0].line).toBe(3);
    expect(db.calls.createMany[0].data.map((d) => d.productCode)).toEqual(["ACT-1", "B2"]);
  });
  it("saves nothing when every row is bad, and refuses empty or huge files", async () => {
    const db = fakeDb();
    const r = await importFreeStock(db, "s", [{ line: 2, ...good, qty: "x" }], staff);
    expect(r).toMatchObject({ ok: true, added: 0, rejectedCount: 1 });
    expect(db.freeStock.createMany).not.toHaveBeenCalled();
    expect(await importFreeStock(db, "s", [], staff)).toEqual({ ok: false, error: "bad_request" });
    expect(await importFreeStock(db, "s", new Array(MAX_IMPORT_ROWS + 1).fill(good), staff)).toEqual({ ok: false, error: "too_many_rows" });
  });
  it("saves a long file in chunks", async () => {
    const db = fakeDb();
    await importFreeStock(db, "s", new Array(1000).fill(good), staff);
    expect(db.calls.createMany.map((c) => c.data.length)).toEqual([400, 400, 200]);
  });
});

describe("the stock downloads", () => {
  it("the list download has every record", async () => {
    const db = fakeDb([stored(1), stored(2)]);
    const r = await buildReport({ db, shop: "s", kind: "freestock" });
    expect(r.count).toBe(2);
    expect(r.csv.trim().split("\r\n")).toHaveLength(3);
    expect((await allFreeStock(db, "s")).length).toBe(2);
  });
  it("the sample download needs no database", async () => {
    const r = await buildReport({ db: {}, shop: "s", kind: "freestocksample" });
    expect(r.csv.startsWith(FREE_STOCK_HEADERS.join(","))).toBe(true);
  });
});

describe("updateFreeStock and deleteFreeStock", () => {
  it("replaces the record's fields, only inside this shop, and allows quantity 0 (used up)", async () => {
    const db = fakeDb([stored(1)]);
    expect(await updateFreeStock(db, "s", "f1", { ...good, qty: "0", warehouseCode: "BAY-2", status: "Held" })).toEqual({ ok: true });
    expect(db.calls.update.where).toEqual({ id: "f1", shop: "s" });
    expect(db.calls.update.data).toMatchObject({ qty: 0, warehouseCode: "BAY-2", status: "Held", costMinor: 12550 });
  });
  it("refuses a bad correction with the reason, and says when the record is gone", async () => {
    const db = fakeDb([stored(1)]);
    expect(await updateFreeStock(db, "s", "f1", { ...good, brand: "" })).toMatchObject({ ok: false, error: "bad_request", message: expect.stringContaining("brand") });
    expect(await updateFreeStock(db, "s", "", good)).toMatchObject({ ok: false, error: "bad_request" });
    expect(await updateFreeStock(fakeDb([]), "s", "gone", good)).toEqual({ ok: false, error: "not_found" });
    expect(normaliseFreeStock({ ...good, qty: "0" }).ok).toBe(false); // adding still needs 1 or more
  });
  it("deletes inside this shop, and says when the record is gone", async () => {
    const db = fakeDb([stored(1)]);
    expect(await deleteFreeStock(db, "s", "f1")).toEqual({ ok: true });
    expect(db.calls.remove.where).toEqual({ id: "f1", shop: "s" });
    expect(await deleteFreeStock(fakeDb([]), "s", "gone")).toEqual({ ok: false, error: "not_found" });
    expect(await deleteFreeStock(db, "s", undefined)).toEqual({ ok: false, error: "not_found" });
  });
});
