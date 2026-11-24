import { describe, expect, it } from "vitest";
import { allocateContainerStock, allocationsByContainer, getOrderContainerStock, removeContainerAllocation } from "./container-allocation.server.js";
import { containerCsv, containerSampleCsv, isOnWater, normaliseContainer, parseExpectedDate } from "./container-stock-rules.js";
import { addContainerFreight, addContainerStock, deleteContainerStock, importContainerStock, listContainerFreight, listContainerStock, updateContainerStock } from "./container-stock.server.js";

const good = { itemVendor: "Vendor A", containerNo: "1234", productCode: "BED-1", productName: "Bed", qty: "10", costDollar: "100.00", price: "250", delvCost: "12.5", totalCbm: "5.5", expectedDate: "31/12/2026" };
const NOW = new Date("2026-11-27T10:00:00Z");

describe("parseExpectedDate", () => {
  it("reads day-first and ISO dates, blank, and refuses the rest", () => {
    expect(parseExpectedDate("31/12/2026")?.toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(parseExpectedDate("2026-12-31")?.toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(parseExpectedDate("  ")).toBeNull();
    for (const bad of ["12/31/2026", "31/02/2026", "soon", "2026-13-01"]) expect(parseExpectedDate(bad)).toBe("bad");
  });
});

describe("normaliseContainer", () => {
  it("turns the dollar cost into pounds at 0.81 and keeps the dollar cost", () => {
    const r = normaliseContainer(good);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ costDollarMinor: 10000, costMinor: 8100, priceMinor: 25000, delvCostMinor: 1250, addedQty: 10, qty: 10, totalCbm: 5.5, itemVendor: "Vendor A" });
  });
  it("lets either quantity be blank and copies the other", () => {
    expect(normaliseContainer({ ...good, qty: "", addedQty: "8" }).data).toMatchObject({ addedQty: 8, qty: 8 });
    expect(normaliseContainer({ ...good, qty: "3", addedQty: "8" }).data).toMatchObject({ addedQty: 8, qty: 3 });
  });
  it("explains what is wrong", () => {
    const why = (over, opts) => normaliseContainer({ ...good, ...over }, opts).reason;
    expect(why({ itemVendor: "" })).toMatch(/vendor/);
    expect(why({ containerNo: "" })).toMatch(/container number/);
    expect(why({ productCode: "" })).toMatch(/product code/);
    expect(why({ qty: "", addedQty: "" })).toMatch(/empty/);
    expect(why({ qty: "x" })).toMatch(/whole number/);
    expect(why({ qty: "0" })).toMatch(/1 or more/);
    expect(why({ costDollar: "abc" })).toMatch(/dollar cost/);
    expect(why({ totalCbm: "big" })).toMatch(/CBM/);
    expect(why({ expectedDate: "12/31/2026" })).toMatch(/expected date/);
  });
  it("allows quantity 0 when correcting a record", () => {
    expect(normaliseContainer({ ...good, qty: "0", addedQty: "10" }, { qtyMin: 0 }).data.qty).toBe(0);
  });
});

describe("isOnWater and the CSV", () => {
  it("is on the water only before the expected date", () => {
    expect(isOnWater({ expectedDate: new Date("2026-12-31T12:00:00Z") }, NOW)).toBe(true);
    expect(isOnWater({ expectedDate: new Date("2026-11-01T12:00:00Z") }, NOW)).toBe(false);
    expect(isOnWater({ expectedDate: null }, NOW)).toBe(false);
  });
  it("writes the same 14 columns the import reads", () => {
    const row = { ...normaliseContainer(good).data, seq: 7 };
    const lines = containerCsv([row]).trim().split(/\r?\n/);
    expect(lines[0].split(",")).toHaveLength(14);
    expect(lines[1]).toContain("CON7");
    expect(lines[1]).toContain("31/12/2026");
    expect(containerSampleCsv().trim().split(/\r?\n/)).toHaveLength(2);
  });
});

// A small in-memory stand-in for the database.
function memoryDb({ stock = [], lines = [], allocations = [], freight = [] } = {}) {
  const state = { stock: stock.map((s) => ({ ...s })), allocations: allocations.map((a) => ({ ...a })), freight: [...freight], next: 1, created: [] };
  const db = {
    state,
    orderLine: {
      findMany: async ({ where }) => lines.filter((l) => l.orderId === where.orderId && l.quantity > 0),
      findFirst: async ({ where }) => lines.find((l) => l.orderId === where.orderId && l.lineId === where.lineId) ?? null,
    },
    order: { findFirst: async () => ({ name: "#1038" }) },
    containerStock: {
      count: async () => state.stock.length,
      findFirst: async ({ where }) => state.stock.find((s) => s.id === where.id) ?? null,
      findMany: async ({ where }) => {
        if (where?.OR?.[0]?.productCode?.equals) {
          const codes = where.OR.map((o) => o.productCode.equals.toLowerCase());
          return state.stock.filter((s) => s.qty > 0 && codes.includes(s.productCode.toLowerCase()));
        }
        return state.stock;
      },
      create: async ({ data }) => { const row = { id: `c${state.next++}`, ...data }; state.stock.push(row); return row; },
      createMany: async ({ data }) => { state.created.push(...data); },
      updateMany: async ({ where, data }) => {
        const row = state.stock.find((s) => s.id === where.id && (!where.qty || s.qty >= where.qty.gte));
        if (!row) return { count: 0 };
        if (data.qty?.decrement) row.qty -= data.qty.decrement;
        else Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => { state.stock.find((s) => s.id === where.id).qty += data.qty.increment; },
      deleteMany: async ({ where }) => { const n = state.stock.length; state.stock = state.stock.filter((s) => s.id !== where.id); return { count: n - state.stock.length }; },
    },
    containerAllocation: {
      findMany: async ({ where }) => state.allocations.filter((a) => (!where.lineId || a.lineId === where.lineId) && (!where.orderId || a.orderId === where.orderId) && (!where.containerStockId || (where.containerStockId.in ? where.containerStockId.in.includes(a.containerStockId) : a.containerStockId === where.containerStockId))).map((a) => ({ createdAt: new Date("2026-11-20T10:00:00Z"), ...a, containerStock: state.stock.find((s) => s.id === a.containerStockId) })),
      findFirst: async ({ where }) => state.allocations.find((a) => a.id === where.id && a.orderId === where.orderId) ?? null,
      create: async ({ data }) => { state.allocations.push({ id: `a${state.next++}`, ...data }); },
      deleteMany: async ({ where }) => { const n = state.allocations.length; state.allocations = state.allocations.filter((a) => a.id !== where.id); return { count: n - state.allocations.length }; },
      count: async ({ where }) => state.allocations.filter((a) => a.containerStockId === where.containerStockId).length,
    },
    containerFreight: {
      create: async ({ data }) => { state.freight.push(data); },
      findMany: async ({ where }) => state.freight.filter((f) => !where.containerNo?.in || where.containerNo.in.includes(f.containerNo)),
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}

const stockRow = (over = {}) => ({ id: "c1", shop: "s", itemVendor: "Vendor A", containerNo: "1234", productCode: "BED-1", productName: "Bed", qty: 3, addedQty: 3, costMinor: 8100, warehouseCode: null, seq: 1, expectedDate: null, ...over });
const line = (over = {}) => ({ shop: "s", orderId: "O1", lineId: "L1", sku: "bed-1 ", quantity: 2, ...over });
const actor = { id: "u1", name: "Sam" };
const give = (db, over = {}) => allocateContainerStock(db, { shop: "s", orderId: "O1", lineId: "L1", containerStockId: "c1", qty: 1, actor, ...over });

describe("allocating container stock", () => {
  it("gives stock, lowers what is left, and remembers the cost", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    expect(await give(db, { qty: 2 })).toEqual({ ok: true });
    expect(db.state.stock[0].qty).toBe(1);
    expect(db.state.allocations[0]).toMatchObject({ containerStockId: "c1", orderName: "#1038", qty: 2, unitCostMinor: 8100, addedByName: "Sam" });
  });
  it("refuses a different product, too many for the line, and more than is left", async () => {
    const other = memoryDb({ stock: [stockRow({ productCode: "X" })], lines: [line()] });
    expect(await give(other)).toEqual({ ok: false, error: "no_match" });
    const db = memoryDb({ stock: [stockRow({ qty: 1 })], lines: [line({ quantity: 5 })] });
    expect(await give(db, { qty: 2 })).toEqual({ ok: false, error: "not_enough" });
    expect(await give(db)).toEqual({ ok: true });
    expect(await give(db)).toEqual({ ok: false, error: "not_enough" });
    const full = memoryDb({ stock: [stockRow()], lines: [line({ quantity: 2 })] });
    await give(full, { qty: 2 });
    expect(await give(full)).toEqual({ ok: false, error: "too_many_for_line" });
  });
  it("takes it back, and lists what each stock record went to", async () => {
    const db = memoryDb({ stock: [stockRow()], lines: [line()] });
    await give(db, { qty: 2 });
    expect(await allocationsByContainer(db, "s", ["c1"])).toEqual({ c1: ["#1038 x2"] });
    expect(await removeContainerAllocation(db, { shop: "s", orderId: "O1", allocationId: db.state.allocations[0].id })).toEqual({ ok: true });
    expect(db.state.stock[0].qty).toBe(3);
    expect(await removeContainerAllocation(db, { shop: "s", orderId: "O1", allocationId: "nope" })).toEqual({ ok: false, error: "not_found" });
  });
  it("offers the matching stock to a line with the vendor, container and expected date", async () => {
    const db = memoryDb({ stock: [stockRow({ expectedDate: new Date("2099-01-05T12:00:00Z") }), stockRow({ id: "c2", productCode: "ZZ" })], lines: [line()] });
    const r = await getOrderContainerStock(db, "s", "O1");
    expect(r.options.L1).toHaveLength(1);
    expect(r.options.L1[0]).toMatchObject({ brand: "Vendor A", containerNo: "1234", expectedDate: "05/01/2099", onWater: true, warehouseCode: "CON1", cost: "81.00", qty: 3 });
  });
});

describe("managing container stock", () => {
  it("adds, corrects and deletes, and will not delete stock given to an order", async () => {
    const db = memoryDb({ lines: [line()] });
    const added = await addContainerStock(db, "s", good, actor);
    expect(added.ok).toBe(true);
    expect(await addContainerStock(db, "s", { ...good, itemVendor: "" }, actor)).toMatchObject({ ok: false, error: "bad_request" });
    expect(await updateContainerStock(db, "s", added.id, { ...good, qty: "4", addedQty: "10" })).toEqual({ ok: true });
    expect(db.state.stock[0].qty).toBe(4);
    expect(await updateContainerStock(db, "s", "nope", good)).toEqual({ ok: false, error: "not_found" });
    db.state.stock[0].productCode = "BED-1";
    await give(db, { containerStockId: added.id });
    expect(await deleteContainerStock(db, "s", added.id)).toEqual({ ok: false, error: "allocated" });
    await removeContainerAllocation(db, { shop: "s", orderId: "O1", allocationId: db.state.allocations[0].id });
    expect(await deleteContainerStock(db, "s", added.id)).toEqual({ ok: true });
  });
  it("imports good rows and reports the bad ones", async () => {
    const db = memoryDb();
    const r = await importContainerStock(db, "s", [{ line: 2, ...good }, { line: 3, ...good, containerNo: "" }], actor);
    expect(r).toMatchObject({ ok: true, added: 1, rejectedCount: 1 });
    expect(r.rejected[0].line).toBe(3);
    expect(await importContainerStock(db, "s", [], actor)).toEqual({ ok: false, error: "bad_request" });
  });
  it("lists soonest first with the freight paid and the on-water flag", async () => {
    const db = memoryDb({ stock: [stockRow({ expectedDate: new Date("2099-01-05T12:00:00Z") })], freight: [{ itemVendor: "Vendor A", containerNo: "1234", freightMinor: 85000 }, { itemVendor: "Vendor A", containerNo: "1234", freightMinor: 5000 }] });
    const r = await listContainerStock(db, "s", {}, NOW);
    expect(r.items[0]).toMatchObject({ freight: "900.00", onWater: true, expectedDate: "05/01/2099", warehouseCode: "CON1" });
  });
});

describe("freight", () => {
  it("records freight and adds entries for the same container together", async () => {
    const db = memoryDb();
    expect(await addContainerFreight(db, "s", { itemVendor: "Vendor A", containerNo: "1234", freight: "850" }, actor)).toEqual({ ok: true });
    expect(await addContainerFreight(db, "s", { itemVendor: "Vendor A", containerNo: "1234", freight: "£50.50" }, actor)).toEqual({ ok: true });
    db.containerFreight.findMany = async () => db.state.freight.map((f) => ({ ...f, createdAt: new Date() }));
    expect(await listContainerFreight(db, "s")).toEqual([{ itemVendor: "Vendor A", containerNo: "1234", freight: "900.50", entries: 2 }]);
  });
  it("refuses a blank vendor, container or an amount that is not above zero", async () => {
    const db = memoryDb();
    for (const bad of [{ itemVendor: "", containerNo: "1", freight: "5" }, { itemVendor: "V", containerNo: "", freight: "5" }, { itemVendor: "V", containerNo: "1", freight: "0" }, { itemVendor: "V", containerNo: "1", freight: "x" }, { itemVendor: "V", containerNo: "1", freight: "" }]) {
      expect(await addContainerFreight(db, "s", bad, actor)).toMatchObject({ ok: false, error: "bad_request" });
    }
    expect(db.state.freight).toHaveLength(0);
  });
});
