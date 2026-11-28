import { describe, expect, it } from "vitest";
import { parsePaypalParams, paypalReport } from "./paypal-orders.server.js";

const O = (n) => `gid://shopify/Order/${n}`;
const NOW = new Date("2026-11-28T12:00:00Z");

function fakeDb(orders, lines) {
  return {
    order: {
      findMany: async ({ where, distinct }) => {
        if (distinct) return [...new Set(orders.map((o) => o.gateway).filter(Boolean))].map((gateway) => ({ gateway }));
        return orders
          .filter((o) => (o.gateway ?? "").toLowerCase().includes(where.gateway.contains) && o.createdAt >= where.createdAt.gte && o.createdAt < where.createdAt.lt)
          .sort((a, b) => b.createdAt - a.createdAt);
      },
    },
    orderLine: {
      findMany: async ({ where }) => lines.filter((l) => where.orderId.in.includes(l.orderId) && (l.lineStatusId === null || !where.OR[1].lineStatusId.notIn.includes(l.lineStatusId))),
    },
  };
}

const orders = [
  { orderId: O(1), name: "#1001", createdAt: new Date("2026-11-20T10:00:00Z"), customerName: "Ann", gateway: "paypal" },
  { orderId: O(2), name: "#1002", createdAt: new Date("2026-11-25T10:00:00Z"), customerName: "Bob", gateway: "PayPal Express Checkout" },
  { orderId: O(3), name: "#1003", createdAt: new Date("2026-11-26T10:00:00Z"), customerName: "Cat", gateway: "shopify_payments" },
  { orderId: O(4), name: "#1004", createdAt: new Date("2026-05-01T10:00:00Z"), customerName: "Dan", gateway: "paypal" },
];
const line = (id, orderId, statusId, price, qty = 1, discount = 0) => ({ lineId: id, orderId, title: `Item ${id}`, sku: null, quantity: qty, priceMinor: price, discountMinor: discount, lineStatusId: statusId, expectedDate: null });
const lines = [
  line("A", O(1), 4, 10000, 2, 1000), // 190.00, green
  line("B", O(1), 15, 5000), // purple
  line("C", O(2), 4, 3000), // green
  line("D", O(2), 9, 9999), // Deleted: left out
  line("E", O(2), null, 1000), // other
  line("F", O(3), 4, 7000), // not PayPal
  line("G", O(4), 6, 2000), // too old for 90 days
];

describe("Paypal Orders", () => {
  it("reads the dates: last 90 days by default, quick ranges, PayPal", () => {
    expect(parsePaypalParams(new URLSearchParams(""), NOW)).toEqual({ from: "2026-08-30", to: "2026-11-28", range: "custom", gateway: "paypal" });
    expect(parsePaypalParams(new URLSearchParams("range=7d"), NOW)).toMatchObject({ from: "2026-11-21", to: "2026-11-28", range: "7d" });
    expect(parsePaypalParams(new URLSearchParams("range=6m&gateway=Manual"), NOW)).toMatchObject({ from: "2026-05-28", gateway: "manual" });
    expect(parsePaypalParams(new URLSearchParams("range=all"), NOW)).toMatchObject({ from: "2013-01-01" });
  });

  it("groups PayPal items by colour group and status, with totals", async () => {
    const r = await paypalReport(fakeDb(orders, lines), "s", parsePaypalParams(new URLSearchParams(""), NOW));
    expect(r.totals).toEqual({ orders: 2, items: 5, valueMinor: 19000 + 5000 + 3000 + 1000, averageMinor: 14000 });
    expect(r.groups.map((g) => g.key)).toEqual(["green", "purple", "other"]);
    const green = r.groups[0];
    expect(green).toMatchObject({ orders: 2, items: 3, valueMinor: 22000 });
    expect(green.statuses[0]).toMatchObject({ statusId: 4, label: "In Stock", orders: 2 });
    expect(green.statuses[0].list.map((o) => o.name)).toEqual(["#1002", "#1001"]);
    expect(r.groups[2].statuses[0]).toMatchObject({ statusId: null, label: "Not set" });
    expect(r.gateways).toContain("shopify_payments");
  });

  it("reports another payment method when asked", async () => {
    const r = await paypalReport(fakeDb(orders, lines), "s", parsePaypalParams(new URLSearchParams("gateway=shopify_payments"), NOW));
    expect(r.totals.orders).toBe(1);
    expect(r.groups[0].statuses[0].list[0].name).toBe("#1003");
  });
});
