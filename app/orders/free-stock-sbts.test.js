import { describe, expect, it, vi } from "vitest";
import { allOtherStock, listFreeStock, markCollected, removeFreeStockMany } from "./free-stock.server.js";
import { buildReport } from "./report-query.server.js";
import { parseReportParams, reportFilename } from "./report-rules.js";

function fakeDb({ rows = [], allocatedIds = [] } = {}) {
  const calls = { find: [] };
  return {
    calls,
    freeStockAllocation: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async ({ where }) => (allocatedIds.includes(where.freeStockId) ? 1 : 0)),
    },
    freeStock: {
      count: vi.fn(async (a) => { calls.count = a; return rows.length; }),
      findMany: vi.fn(async (a) => {
        calls.find.push(a);
        if (a.distinct?.[0] === "brand") return [{ brand: "Zed" }, { brand: "Actona" }];
        if (a.distinct?.[0] === "itemType") return [{ itemType: "SBTS" }, { itemType: "Display" }];
        return rows;
      }),
      updateMany: vi.fn(async (a) => { calls.update = a; return { count: a.where.id.in.length }; }),
      deleteMany: vi.fn(async (a) => { (calls.removed ??= []).push(a.where.id); return { count: 1 }; }),
    },
  };
}
const stored = (over = {}) => ({ id: "f1", itemType: "SBTS", sourceOrder: null, brand: "Actona", productName: "Bed", qty: 1, productCode: "A1", warehouseCode: null, seq: 1, rma: null, remarks: null, costMinor: 1000, creditFoc: null, status: null, collection: null, isCollected: false, addedByName: "Sam", createdAt: new Date(), ...over });

describe("listFreeStock groups, brands and collected", () => {
  it("the free group only ever lists free stock, even if another type is asked for", async () => {
    const db = fakeDb();
    await listFreeStock(db, "s", { group: "free", itemType: "SBTS" });
    expect(db.calls.count.where.itemType).toBe("freeStock");
  });
  it("the other group lists every type except free stock, can narrow to one, and lists its brands", async () => {
    const db = fakeDb({ rows: [stored({ isCollected: true })] });
    const r = await listFreeStock(db, "s", { group: "other" });
    expect(db.calls.count.where.itemType).toEqual({ not: "freeStock" });
    expect(r.brands).toEqual(["Actona", "Zed"]);
    expect(r.items[0].collected).toBe(true);
    await listFreeStock(db, "s", { group: "other", itemType: "Display", brand: "Actona" });
    expect(db.calls.count.where).toMatchObject({ itemType: "Display", brand: "Actona" });
    await listFreeStock(db, "s", { group: "other", itemType: "freeStock" });
    expect(db.calls.count.where.itemType).toEqual({ not: "freeStock" });
  });
  it("the brand and type lists come from the group, not the whole shop", async () => {
    const db = fakeDb();
    await listFreeStock(db, "s", { group: "other" });
    const distinct = db.calls.find.filter((a) => a.distinct);
    expect(distinct).toHaveLength(2);
    for (const a of distinct) expect(a.where.itemType).toEqual({ not: "freeStock" });
  });
});

describe("markCollected", () => {
  it("marks the chosen items (once each) for this shop only", async () => {
    const db = fakeDb();
    expect(await markCollected(db, "s", ["a", "b", "a"], true)).toEqual({ ok: true, changed: 2 });
    expect(db.calls.update).toEqual({ where: { shop: "s", id: { in: ["a", "b"] } }, data: { isCollected: true } });
    await markCollected(db, "s", ["a"], false);
    expect(db.calls.update.data).toEqual({ isCollected: false });
  });
  it("refuses an empty list, a bad id list or a non-yes/no value", async () => {
    const db = fakeDb();
    for (const [ids, flag] of [[[], true], [undefined, true], [[1, null, ""], true], [["a"], "yes"]]) expect(await markCollected(db, "s", ids, flag)).toEqual({ ok: false, error: "bad_request" });
    expect(db.freeStock.updateMany).not.toHaveBeenCalled();
  });
});

describe("removeFreeStockMany", () => {
  it("removes what it can and keeps what was given to an order", async () => {
    const db = fakeDb({ rows: [stored()], allocatedIds: ["b"] });
    expect(await removeFreeStockMany(db, "s", ["a", "b", "c"])).toEqual({ ok: true, removed: 2, kept: 1 });
    expect(db.calls.removed).toEqual(["a", "c"]);
  });
  it("refuses an empty list and caps a huge one", async () => {
    const db = fakeDb({ rows: [stored()] });
    expect(await removeFreeStockMany(db, "s", [])).toEqual({ ok: false, error: "bad_request" });
    const many = Array.from({ length: 800 }, (_, i) => `id${i}`);
    const r = await removeFreeStockMany(db, "s", many);
    expect(r.removed).toBe(500);
  });
});

describe("the SBTS and display download", () => {
  it("is a hidden kind with its own file name, and lists every type except free stock", async () => {
    expect(parseReportParams("sbtsstock", () => undefined)).toEqual({ range: undefined, terms: undefined });
    expect(reportFilename("sbtsstock")).toBe("sbts_display_stock.csv");
    const db = fakeDb({ rows: [stored()] });
    await allOtherStock(db, "s");
    expect(db.calls.find[0].where).toEqual({ shop: "s", itemType: { not: "freeStock" } });
    const report = await buildReport({ db, shop: "s", kind: "sbtsstock" });
    expect(report.count).toBe(1);
    expect(report.csv).toContain("SBTS");
  });
});
