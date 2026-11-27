import { describe, expect, it } from "vitest";
import {
  balancePendingAllCsv, balancePendingCsv, balancePendingFileName, balancePendingRowsFor, isListed, listBalancePending, parseBalancePendingParams, refundMark,
} from "./balance-pending.server.js";

const gid = (n) => `gid://shopify/Order/${n}`;
const order = (n, extra = {}) => ({
  orderId: gid(n), name: `#CFS${n}`, createdAt: new Date(Date.UTC(2026, 10, n, 10)), cancelledAt: null, customerName: `Cust ${n}`, email: `c${n}@x.co`,
  postcode: "le1 1aa", gateway: "Kody", totalMinor: 10000, outstandingMinor: 4000, refundedMinor: 0, ...extra,
});
const line = (orderId, id, extra = {}) => ({ id, orderId, lineId: `L${id}`, vendor: "Brand", title: `Item ${id}`, quantity: 1, priceMinor: 5000, discountMinor: 0, variantId: `V${id}`, lineStatusId: 3, expectedDate: null, ...extra });
const makeDb = (orders, lines) => ({
  order: { findMany: async ({ where }) => orders.filter((o) => !o.cancelledAt && o.outstandingMinor > 0 && o.shop !== "other").sort((a, b) => b.createdAt - a.createdAt) },
  orderLine: { findMany: async ({ where }) => lines.filter((l) => where.orderId.in.includes(l.orderId)) },
});

describe("which orders are listed", () => {
  it("needs one live line, or the chosen status", () => {
    expect(isListed([3, 6])).toBe(true);
    expect(isListed([6, 7, 32])).toBe(false);
    expect(isListed([58])).toBe(false);
    expect(isListed([null])).toBe(true);
    expect(isListed([])).toBe(true);
    expect(isListed([6, 4], 6)).toBe(true);
    expect(isListed([3], 6)).toBe(false);
  });
  it("marks full and part refunds", () => {
    expect(refundMark({ refundedMinor: 0 }, [7, 32])).toBe("full");
    expect(refundMark({ refundedMinor: 500 }, [3, 7])).toBe("part");
    expect(refundMark({ refundedMinor: 0 }, [3])).toBe(null);
  });
  it("reads the page parameters", () => {
    expect(parseBalancePendingParams(new URLSearchParams("page=2&status=4&q= cfs1 "))).toEqual({ all: false, page: 2, status: 4, q: "cfs1" });
    expect(parseBalancePendingParams(new URLSearchParams("all=1&status=999"))).toEqual({ all: true, page: 1, status: 0, q: "" });
  });
});

describe("the list", () => {
  const orders = [order(1), order(2, { outstandingMinor: 0 }), order(3, { gateway: "PayPal" }), order(4), order(5, { cancelledAt: new Date() })];
  const lines = [line(gid(1), 1), line(gid(3), 2, { lineStatusId: 4 }), line(gid(3), 3, { lineStatusId: 6 }), line(gid(4), 4, { lineStatusId: 6 })];
  const db = makeDb(orders, lines);

  it("lists owing orders newest first with paid and owed, and sums them", async () => {
    const r = await listBalancePending(db, "s", {});
    expect(r.rows.map((x) => x.orderName)).toEqual(["CFS3", "CFS1"]);
    expect(r.rows[0]).toMatchObject({ totalMinor: 10000, paidMinor: 6000, balanceMinor: 4000, statuses: [4, 6], payment: "PayPal" });
    expect([r.total, r.balanceMinor, r.paidMinor]).toEqual([2, 8000, 12000]);
  });
  it("filters by status and by search", async () => {
    expect((await listBalancePending(db, "s", { status: 6 })).rows.map((x) => x.orderName)).toEqual(["CFS4", "CFS3"]);
    expect((await listBalancePending(db, "s", { q: "paypal" })).rows.map((x) => x.orderName)).toEqual(["CFS3"]);
    expect((await listBalancePending(db, "s", { q: "c1@x" })).rows.map((x) => x.orderName)).toEqual(["CFS1"]);
  });
  it("exports the ticked orders like the old file", async () => {
    const rows = await balancePendingRowsFor(db, "s", ["3"]);
    const csv = balancePendingCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("﻿Order No,Order Date,Customer,Grand Total,Balance Amount,Status,ePaymentOption");
    expect(csv.split("\r\n")[1]).toBe("CFS3,November 03 2026,Cust 3,100.00,40.00,In Stock,PayPal");
    expect(balancePendingFileName(0)).toBe("Pending-Balance.csv");
    expect(balancePendingFileName(4)).toBe("In Stock - Pending-Balance.csv");
  });
});

describe("Download All", () => {
  it("lists live lines and splits the paid and owed amounts by final sale price", async () => {
    const orders = [order(1, { totalMinor: 15000, outstandingMinor: 6000 })];
    const lines = [
      line(gid(1), 1, { priceMinor: 5000, quantity: 2, expectedDate: "2026-12-05", lineStatusId: 3 }),
      line(gid(1), 2, { priceMinor: 6000, discountMinor: 1000, lineStatusId: 4 }),
      line(gid(1), 3, { lineStatusId: 56 }),
    ];
    const graphql = async () => ({ json: async () => ({ data: { nodes: [{ id: "V1", inventoryItem: { unitCost: { amount: "20.00" } } }] } }) });
    const out = await balancePendingAllCsv(makeDb(orders, lines), graphql, "s", new Date(Date.UTC(2026, 10, 27, 12)));
    const [head, a, b] = out.csv.replace("﻿", "").split("\r\n");
    expect(head).toBe("Date,Order No.,Brand,Product,Sold Qty,Unit Cost,Total Cost,Unit Sale Price,Total Sale Price,Final Sale Price,Deposit Amount,Balance Amount,ePaymentOption,Exp Due Date,Status");
    // Paid 90.00 and owed 60.00 shared over 100.00 + 50.00.
    expect(a).toBe("01/11/2026,CFS1,Brand,Item 1,2,20.00,40.00,50.00,100.00,100.00,60.00,40.00,Kody,05/12/2026,Order in Progress");
    expect(b).toBe("01/11/2026,CFS1,Brand,Item 2,1,,,60.00,60.00,50.00,30.00,20.00,Kody,---,In Stock");
    expect(out.count).toBe(2);
    expect(out.fileName).toBe("Balance-Pending-27-11-2026.csv");
  });
  it("still downloads when Shopify cannot be read (costs blank)", async () => {
    const out = await balancePendingAllCsv(makeDb([order(1)], [line(gid(1), 1)]), async () => { throw new Error("down"); }, "s");
    expect(out.costLookup).toBe("unavailable");
    expect(out.count).toBe(1);
  });
});
