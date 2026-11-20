import { describe, expect, it } from "vitest";
import { fakeDb, gqlLine, gqlOrder } from "./fixtures.js";
import { mapOrder } from "./map-order.js";
import { upsertOrder } from "./mirror.server.js";

const rows = (over, lines) => mapOrder("s", gqlOrder({ ...over, ...(lines ? { lineItems: { nodes: lines } } : {}) }));

describe("upsertOrder", () => {
  it("saves a new order with its lines and flat money columns", async () => {
    const db = fakeDb();
    expect(await upsertOrder(db, rows())).toEqual({ outcome: "saved" });
    const saved = db.orders.get("s|gid://shopify/Order/1");
    expect(saved).toMatchObject({ name: "#1036", totalMinor: 29900, currency: "GBP", shippingMinor: 2000 });
    expect(db.lines).toHaveLength(1);
    expect(db.lines[0]).toMatchObject({ priceMinor: 27900, lineId: "gid://shopify/LineItem/1" });
  });

  it("replaces the order and its lines when the new copy is newer", async () => {
    const db = fakeDb();
    await upsertOrder(db, rows({ updatedAt: "2026-11-19T10:00:00Z" }));
    const result = await upsertOrder(db, rows({ updatedAt: "2026-11-19T11:00:00Z", displayFinancialStatus: "REFUNDED" }, [gqlLine(2)]));
    expect(result).toEqual({ outcome: "saved" });
    expect(db.orders.get("s|gid://shopify/Order/1").financialStatus).toBe("REFUNDED");
    expect(db.lines.map((l) => l.lineId)).toEqual(["gid://shopify/LineItem/2"]);
  });

  it("reports stale and leaves the data alone when the stored copy is newer", async () => {
    const db = fakeDb();
    await upsertOrder(db, rows({ updatedAt: "2026-11-19T11:00:00Z", displayFinancialStatus: "REFUNDED" }));
    const result = await upsertOrder(db, rows({ updatedAt: "2026-11-19T10:00:00Z", displayFinancialStatus: "PAID" }, [gqlLine(9)]));
    expect(result).toEqual({ outcome: "stale" });
    expect(db.orders.get("s|gid://shopify/Order/1").financialStatus).toBe("REFUNDED");
    expect(db.lines.map((l) => l.lineId)).toEqual(["gid://shopify/LineItem/1"]);
  });

  it("is safe to repeat: the same copy twice leaves one order and one set of lines", async () => {
    const db = fakeDb();
    await upsertOrder(db, rows());
    expect(await upsertOrder(db, rows())).toEqual({ outcome: "saved" });
    expect(db.orders.size).toBe(1);
    expect(db.lines).toHaveLength(1);
  });
});

describe("upsertOrder archive flag", () => {
  it("keeps archivedAt on a repeat save and marks the rebuilt lines archived", async () => {
    const db = fakeDb();
    await upsertOrder(db, rows());
    const key = "s|gid://shopify/Order/1";
    const archivedAt = new Date("2026-11-20T00:00:00Z");
    db.orders.set(key, { ...db.orders.get(key), archivedAt });
    const newer = rows();
    newer.order.shopifyUpdatedAt = new Date("2027-01-01T00:00:00Z");
    await upsertOrder(db, newer);
    expect(db.orders.get(key).archivedAt).toEqual(archivedAt);
    expect(db.lines[0].orderArchived).toBe(true);
  });

  it("writes the list fields", async () => {
    const db = fakeDb();
    const r = rows();
    Object.assign(r.order, { gateway: "kody", outstanding: { minor: 500, currency: "GBP" }, refunded: { minor: 0, currency: "GBP" }, brands: ["A"], lineStatusIds: [3], orderStatusId: 3, phone: "1", postcode: "P", orderTakenBy: "X", orderSource: "Y" });
    Object.assign(r.lines[0], { lineStatusId: 3, expectedDate: "2026-12-10", deliveryOutcome: null, orderCreatedAt: new Date("2026-11-18T00:00:00Z") });
    await upsertOrder(db, r);
    expect(db.orders.get("s|gid://shopify/Order/1")).toMatchObject({ gateway: "kody", outstandingMinor: 500, refundedMinor: 0, brands: ["A"], lineStatusIds: [3], orderStatusId: 3, phone: "1", postcode: "P", orderTakenBy: "X", orderSource: "Y" });
    expect(db.lines[0]).toMatchObject({ lineStatusId: 3, expectedDate: "2026-12-10", orderArchived: false });
  });
});
