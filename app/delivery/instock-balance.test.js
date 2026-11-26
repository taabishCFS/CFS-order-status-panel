import { describe, expect, it } from "vitest";
import { balanceRowsFor, instockBalanceCsv, listInstockBalance, owesWhileInstock, parseBalanceParams } from "./instock-balance.server.js";

const order = (n, extra = {}) => ({ orderId: `gid://shopify/Order/${n}`, name: `#CFS${n}`, createdAt: new Date(`2026-11-${10 + n}T10:00:00Z`), cancelledAt: null, archivedAt: null, customerName: `Cust ${n}`, postcode: "LE1 1AA", gateway: "Kody", totalMinor: 10000, outstandingMinor: 5000, lineStatusIds: [4], ...extra });
const makeDb = (orders) => ({ order: { findMany: async () => orders.filter((o) => !o.cancelledAt && !o.archivedAt && o.outstandingMinor > 0).sort((a, b) => b.createdAt - a.createdAt) } });

describe("which orders are listed", () => {
  it("needs a balance, and every line Coming IN, In Stock or Allocated", () => {
    expect(owesWhileInstock(order(1))).toBe(true);
    expect(owesWhileInstock(order(1, { lineStatusIds: [4, 14, 43] }))).toBe(true);
    expect(owesWhileInstock(order(1, { lineStatusIds: [4, 6] }))).toBe(false);
    expect(owesWhileInstock(order(1, { lineStatusIds: [] }))).toBe(false);
    expect(owesWhileInstock(order(1, { outstandingMinor: 0 }))).toBe(false);
    expect(owesWhileInstock(order(1, { cancelledAt: new Date() }))).toBe(false);
  });
  it("reads the page parameters", () => {
    expect(parseBalanceParams(new URLSearchParams("page=3"))).toEqual({ all: false, page: 3 });
    expect(parseBalanceParams(new URLSearchParams("all=1&page=x"))).toEqual({ all: true, page: 1 });
  });
});

describe("the list", () => {
  it("is newest first, pages by 50 and totals the balance shown", async () => {
    const orders = Array.from({ length: 60 }, (_, i) => order(i + 1, { createdAt: new Date(2026, 0, 1 + i) }));
    orders.push(order(99, { lineStatusIds: [4, 6] }));
    const p1 = await listInstockBalance(makeDb(orders), "s", { page: 1 });
    expect([p1.total, p1.rows.length, p1.pageCount, p1.balanceMinor]).toEqual([60, 50, 2, 250000]);
    expect(p1.rows[0].orderName).toBe("CFS60");
    const p2 = await listInstockBalance(makeDb(orders), "s", { page: 2 });
    expect(p2.rows.length).toBe(10);
    expect((await listInstockBalance(makeDb(orders), "s", { all: true })).rows.length).toBe(60);
  });
});

describe("the download", () => {
  it("has the six old columns and only ticked orders", async () => {
    const db = makeDb([order(1), order(2, { customerName: 'A "B", C', lineStatusIds: [43] })]);
    const rows = await balanceRowsFor(db, "s", ["2"]);
    expect(rows.map((r) => r.orderName)).toEqual(["CFS2"]);
    const csv = instockBalanceCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("\uFEFFOrder No,Order Date,Customer,Grand Total,Balance Amount,Status");
    expect(csv.split("\r\n")[1]).toBe('CFS2,November 12 2026,"A ""B"", C",100.00,50.00,Allocated From Stock');
  });
});
