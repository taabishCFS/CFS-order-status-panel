import { describe, expect, it, vi } from "vitest";
import { archiveOrders, listBrands, listLines, listOrders } from "./list-query.server.js";

const params = (over = {}) => ({ page: 1, all: false, brand: null, from: null, to: null, q: "", statusId: null, takenBy: null, archived: false, insurance: false, ...over });
const order = (n, over = {}) => ({ orderId: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: new Date("2026-11-20T10:00:00Z"), site: "CFS", customerName: `Cust ${n}`, email: `c${n}@x.com`, gateway: "kody", totalMinor: 10000, currency: "GBP", financialStatus: "PAID", cancelledAt: null, orderStatusId: null, orderTakenBy: null, orderSource: null, archivedAt: null, ...over });
const line = (orderN, n, over = {}) => ({ orderId: `gid://shopify/Order/${orderN}`, lineId: `L${n}`, lineStatusId: 3, ...over });

function fakeDb({ orders = [], total = orders.length, lines = [], repeats = [], grouped = [], fullLines = [], vendors = [] } = {}) {
  return {
    order: { count: vi.fn(async () => total), findMany: vi.fn(async () => orders), groupBy: vi.fn(async () => repeats), updateMany: vi.fn(async () => ({ count: 2 })) },
    orderLine: { findMany: vi.fn(async (a) => (a.select?.vendor ? vendors : a.take ? fullLines : lines)), count: vi.fn(async () => grouped.length), groupBy: vi.fn(async () => grouped), updateMany: vi.fn(async () => ({ count: 5 })) },
    $transaction: async (fn) => fn(this ?? {}),
  };
}

describe("listOrders", () => {
  it("pages 50 at a time, newest first, and reports the totals", async () => {
    const db = fakeDb({ orders: [order(1)], total: 120 });
    const res = await listOrders(db, "s", params({ page: 2 }));
    const args = db.order.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 50, take: 50 });
    expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(res).toMatchObject({ total: 120, page: 2, pageCount: 3, capped: false });
  });

  it("clamps a page past the end to the last page", async () => {
    const db = fakeDb({ orders: [order(1)], total: 120 });
    const res = await listOrders(db, "s", params({ page: 99 }));
    expect(res.page).toBe(3);
    expect(db.order.findMany.mock.calls[0][0].skip).toBe(100);
  });

  it("shows one empty page when nothing matches", async () => {
    const res = await listOrders(fakeDb({ orders: [], total: 0 }), "s", params({ page: 4 }));
    expect(res).toMatchObject({ rows: [], total: 0, page: 1, pageCount: 1 });
  });

  it("All takes up to 2000 orders and says when it was cut short", async () => {
    const db = fakeDb({ orders: [order(1)], total: 5000 });
    const res = await listOrders(db, "s", params({ all: true }));
    expect(db.order.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 2000 });
    expect(res).toMatchObject({ capped: true, pageCount: 1, page: 1 });
  });

  it("loads lines and repeat counts only for the orders on the page and builds the rows", async () => {
    const orders = [order(1, { financialStatus: "PARTIALLY_PAID" }), order(2, { name: "#R2" })];
    const db = fakeDb({
      orders,
      lines: [line(1, 1, { lineStatusId: 3 }), line(1, 2, { lineStatusId: null }), line(2, 3, { lineStatusId: 4 })],
      repeats: [{ email: "c1@x.com", _count: { _all: 2 } }, { email: "c2@x.com", _count: { _all: 1 } }],
    });
    const res = await listOrders(db, "s", params());
    expect(db.orderLine.findMany.mock.calls[0][0].where).toMatchObject({ shop: "s", orderId: { in: ["gid://shopify/Order/1", "gid://shopify/Order/2"] } });
    expect(db.order.groupBy.mock.calls[0][0].where).toMatchObject({ shop: "s", email: { in: ["c1@x.com", "c2@x.com"] } });
    expect(res.rows[0]).toMatchObject({ name: "#1", tone: "red", payType: "partial", lineStatuses: [3, null], repeatCustomer: true, archived: false });
    expect(res.rows[1]).toMatchObject({ tone: "blue", lineStatuses: [4], repeatCustomer: false });
  });

  it("skips the follow-up queries when the page is empty", async () => {
    const db = fakeDb({ orders: [], total: 0 });
    await listOrders(db, "s", params());
    expect(db.orderLine.findMany).not.toHaveBeenCalled();
    expect(db.order.groupBy).not.toHaveBeenCalled();
  });
});

describe("listLines", () => {
  const stored = (n, orderN, over = {}) => ({ orderId: `gid://shopify/Order/${orderN}`, lineId: `L${n}`, title: `Item ${n}`, vendor: "Actona", sku: `S${n}`, variantTitle: null, quantity: 2, priceMinor: 5000, currency: "GBP", lineStatusId: 3, expectedDate: "2026-12-10", deliveryOutcome: null, orderCreatedAt: new Date("2026-11-20T10:00:00Z"), ...over });

  it("takes at most 5000 lines and joins the order name and site", async () => {
    const db = fakeDb({ fullLines: [stored(1, 1), stored(2, 1, { vendor: null })], grouped: [{ orderId: "gid://shopify/Order/1", _count: { _all: 2 }, _sum: { quantity: 4 } }], total: 1 });
    db.order.findMany = vi.fn(async () => [{ orderId: "gid://shopify/Order/1", name: "#1", site: "CFS" }]);
    const res = await listLines(db, "s", params());
    expect(db.orderLine.findMany.mock.calls[0][0]).toMatchObject({ take: 5000 });
    expect(db.order.findMany.mock.calls[0][0].where).toMatchObject({ shop: "s", orderId: { in: ["gid://shopify/Order/1"] } });
    expect(res.rows[0]).toMatchObject({ orderName: "#1", site: "CFS", brand: "Actona", product: "Item 1", quantity: 2, lineStatusId: 3, expectedDate: "2026-12-10", supplierInvoicePaid: false });
    expect(res.rows[1].brand).toBe("Unmapped");
  });

  it("builds the summary from one grouped query and flags a capped list", async () => {
    const grouped = [{ orderId: "a", _count: { _all: 3 }, _sum: { quantity: 4 } }, { orderId: "b", _count: { _all: 2 }, _sum: { quantity: 2 } }];
    const db = fakeDb({ fullLines: [], grouped });
    db.order.findMany = vi.fn(async () => []);
    const res = await listLines(db, "s", params());
    expect(db.orderLine.groupBy).toHaveBeenCalledTimes(1);
    expect(res.summary).toEqual({ lines: 5, orders: 2, units: 6 });
    expect(res.capped).toBe(false);
  });
});

describe("listBrands", () => {
  it("returns the distinct vendors sorted, with a blank vendor as Unmapped", async () => {
    const db = fakeDb({ vendors: [{ vendor: "Zed" }, { vendor: null }, { vendor: " Actona " }, { vendor: "" }] });
    expect(await listBrands(db, "s")).toEqual(["Actona", "Unmapped", "Zed"]);
    expect(db.orderLine.findMany.mock.calls[0][0].where).toEqual({ shop: "s" });
  });
});

describe("archiveOrders", () => {
  it("archives only this shop's orders and marks their lines, in one transaction", async () => {
    const tx = { order: { updateMany: vi.fn(async () => ({ count: 2 })) }, orderLine: { updateMany: vi.fn(async () => ({ count: 5 })) } };
    const db = { $transaction: async (fn) => fn(tx) };
    expect(await archiveOrders(db, "s", ["a", "b"], true)).toEqual({ count: 2 });
    expect(tx.order.updateMany.mock.calls[0][0].where).toMatchObject({ shop: "s", orderId: { in: ["a", "b"] }, archivedAt: null });
    expect(tx.order.updateMany.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
    expect(tx.orderLine.updateMany.mock.calls[0][0]).toMatchObject({ where: { shop: "s", orderId: { in: ["a", "b"] } }, data: { orderArchived: true } });
  });

  it("restores by clearing the flag", async () => {
    const tx = { order: { updateMany: vi.fn(async () => ({ count: 1 })) }, orderLine: { updateMany: vi.fn(async () => ({ count: 1 })) } };
    await archiveOrders({ $transaction: async (fn) => fn(tx) }, "s", ["a"], false);
    expect(tx.order.updateMany.mock.calls[0][0]).toMatchObject({ where: { archivedAt: { not: null } }, data: { archivedAt: null } });
    expect(tx.orderLine.updateMany.mock.calls[0][0].data).toEqual({ orderArchived: false });
  });
});
