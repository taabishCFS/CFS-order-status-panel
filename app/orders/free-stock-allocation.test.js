import { describe, expect, it } from "vitest";
import { allocateStock, allocationsByStock, getOrderStock, removeAllocation } from "./free-stock-allocation.server.js";
import { deleteFreeStock } from "./free-stock.server.js";

// A small in-memory stand-in for the database, enough to run the real allocation steps.
function memoryDb({ stock = [], lines = [], orders = [{ orderId: "O1", name: "#1038" }], allocations = [] } = {}) {
  const state = { stock: stock.map((s) => ({ ...s })), allocations: allocations.map((a) => ({ ...a })), next: 1 };
  const db = {
    state,
    orderLine: {
      findMany: async ({ where }) => lines.filter((l) => l.orderId === where.orderId && l.quantity > 0),
      findFirst: async ({ where }) => lines.find((l) => l.orderId === where.orderId && l.lineId === where.lineId) ?? null,
    },
    order: { findFirst: async ({ where }) => orders.find((o) => o.orderId === where.orderId) ?? null },
    freeStock: {
      findFirst: async ({ where }) => state.stock.find((s) => s.id === where.id) ?? null,
      findMany: async ({ where }) => {
        const codes = where.OR.map((o) => o.productCode.equals.toLowerCase());
        return state.stock.filter((s) => s.qty > 0 && codes.includes(s.productCode.toLowerCase()));
      },
      updateMany: async ({ where, data }) => {
        const row = state.stock.find((s) => s.id === where.id && s.qty >= where.qty.gte);
        if (!row) return { count: 0 };
        row.qty -= data.qty.decrement;
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        state.stock.find((s) => s.id === where.id).qty += data.qty.increment;
      },
    },
    freeStockAllocation: {
      findMany: async ({ where }) => state.allocations.filter((a) => (!where.lineId || a.lineId === where.lineId) && (!where.orderId || a.orderId === where.orderId) && (!where.freeStockId || (where.freeStockId.in ? where.freeStockId.in.includes(a.freeStockId) : a.freeStockId === where.freeStockId))).map((a) => ({ createdAt: new Date("2026-11-20T10:00:00Z"), ...a, freeStock: state.stock.find((s) => s.id === a.freeStockId) })),
      findFirst: async ({ where }) => state.allocations.find((a) => a.id === where.id && a.orderId === where.orderId) ?? null,
      create: async ({ data }) => { state.allocations.push({ id: `a${state.next++}`, ...data }); },
      deleteMany: async ({ where }) => { const before = state.allocations.length; state.allocations = state.allocations.filter((a) => a.id !== where.id); return { count: before - state.allocations.length }; },
      count: async ({ where }) => state.allocations.filter((a) => a.freeStockId === where.freeStockId).length,
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}

const stockRow = (over = {}) => ({ id: "f1", shop: "s", brand: "Actona", productName: "Bed", productCode: "ACT-1", qty: 3, costMinor: 12550, warehouseCode: null, seq: 1, ...over });
const line = (over = {}) => ({ shop: "s", orderId: "O1", lineId: "L1", sku: "act-1 ", quantity: 2, ...over });
const actor = { id: "u1", name: "Sam" };
const give = (db, over = {}) => allocateStock(db, { shop: "s", orderId: "O1", lineId: "L1", freeStockId: "f1", qty: 1, actor, ...over });

describe("allocateStock", () => {
  it("gives stock to the line, lowers what is left, and remembers the cost, the order and who did it", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    expect(await give(db, { qty: 2 })).toEqual({ ok: true });
    expect(db.state.stock[0].qty).toBe(1);
    expect(db.state.allocations[0]).toMatchObject({ freeStockId: "f1", orderId: "O1", orderName: "#1038", lineId: "L1", qty: 2, unitCostMinor: 12550, addedByName: "Sam" });
  });
  it("matches the product code to the SKU ignoring case and spaces, and refuses a different product", async () => {
    const db = memoryDb({ stock: [stockRow({ productCode: "OTHER" })], lines: [line()] });
    expect(await give(db)).toEqual({ ok: false, error: "no_match" });
    expect(db.state.stock[0].qty).toBe(3);
  });
  it("refuses more than is left, and changes nothing", async () => {
    const db = memoryDb({ stock: [stockRow({ qty: 1 })], lines: [line({ quantity: 5 })] });
    expect(await give(db, { qty: 2 })).toEqual({ ok: false, error: "not_enough" });
    expect(db.state.stock[0].qty).toBe(1);
    expect(db.state.allocations).toHaveLength(0);
  });
  it("two people cannot take the last item: the second is told there is not enough", async () => {
    const db = memoryDb({ stock: [stockRow({ qty: 1 })], lines: [line()] });
    expect(await give(db)).toEqual({ ok: true });
    expect(await give(db)).toEqual({ ok: false, error: "not_enough" });
    expect(db.state.stock[0].qty).toBe(0);
  });
  it("does not give a line more than it ordered, counting what it already has", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line({ quantity: 2 })] });
    expect(await give(db, { qty: 2 })).toEqual({ ok: true });
    expect(await give(db, { qty: 1 })).toEqual({ ok: false, error: "too_many_for_line" });
    expect(db.state.stock[0].qty).toBe(1);
  });
  it("refuses bad quantities, an unknown line and unknown stock", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    for (const qty of [0, -1, 1.5, NaN, 100001]) expect(await give(db, { qty })).toEqual({ ok: false, error: "bad_request" });
    expect(await give(db, { lineId: "nope" })).toEqual({ ok: false, error: "no_line" });
    expect(await give(db, { freeStockId: "nope" })).toEqual({ ok: false, error: "no_stock" });
  });
});

describe("removeAllocation", () => {
  it("puts the quantity back and deletes the allocation", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    await give(db, { qty: 2 });
    expect(await removeAllocation(db, { shop: "s", orderId: "O1", allocationId: db.state.allocations[0].id })).toEqual({ ok: true });
    expect(db.state.stock[0].qty).toBe(3);
    expect(db.state.allocations).toHaveLength(0);
  });
  it("says not found for a missing or other order's allocation, without changing stock", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    await give(db);
    expect(await removeAllocation(db, { shop: "s", orderId: "O2", allocationId: "a1" })).toEqual({ ok: false, error: "not_found" });
    expect(await removeAllocation(db, { shop: "s", orderId: "O1", allocationId: "" })).toEqual({ ok: false, error: "not_found" });
    expect(db.state.stock[0].qty).toBe(2);
  });
});

describe("getOrderStock", () => {
  it("offers each line the stock with its SKU that has some left, and lists what was given", async () => {
    const db = memoryDb({
      stock: [stockRow(), stockRow({ id: "f2", qty: 0 }), stockRow({ id: "f3", productCode: "ZZZ" })],
      lines: [line(), line({ lineId: "L2", sku: null })],
    });
    await give(db);
    const r = await getOrderStock(db, "s", "O1");
    expect(Object.keys(r.options)).toEqual(["L1"]);
    expect(r.options.L1.map((o) => o.id)).toEqual(["f1"]);
    expect(r.options.L1[0]).toMatchObject({ warehouseCode: "FSS1", cost: "125.50", qty: 2 });
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]).toMatchObject({ lineId: "L1", qty: 1, brand: "Actona", productCode: "ACT-1", unitCost: "125.50" });
  });
  it("gives nothing for an order with no SKUs", async () => {
    const r = await getOrderStock(memoryDb({ lines: [line({ sku: null })] }), "s", "O1");
    expect(r).toEqual({ allocations: [], options: {} });
  });
});

describe("deleting stock that was given out, and the Stock page's list of orders", () => {
  it("refuses to delete allocated stock", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    await give(db);
    db.freeStock.deleteMany = async () => { throw new Error("must not be called"); };
    expect(await deleteFreeStock(db, "s", "f1")).toEqual({ ok: false, error: "allocated" });
  });
  it("turns the database's own refusal into the same answer", async () => {
    const db = memoryDb({ stock: [stockRow()] });
    db.freeStock.deleteMany = async () => { throw Object.assign(new Error("fk"), { code: "P2003" }); };
    expect(await deleteFreeStock(db, "s", "f1")).toEqual({ ok: false, error: "allocated" });
  });
  it("lists the orders each stock item went to", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    await give(db, { qty: 2 });
    expect(await allocationsByStock(db, "s", ["f1", "f9"])).toEqual({ f1: ["#1038 x2"] });
    expect(await allocationsByStock(db, "s", [])).toEqual({});
  });
});
