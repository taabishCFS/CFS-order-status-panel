import { describe, expect, it, vi } from "vitest";
import { recordOpen } from "./order-open.server";

const staff = { id: "9", name: "Sam Patel" };
const args = { shop: "s.myshopify.com", orderId: "gid://shopify/Order/1", staff, now: new Date("2026-11-23T12:00:00Z") };

describe("recordOpen", () => {
  it("returns null for the first open and records it", async () => {
    const db = { orderOpen: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) } };
    expect(await recordOpen(db, args)).toBeNull();
    expect(db.orderOpen.upsert.mock.calls[0][0]).toMatchObject({ where: { shop_orderId: { shop: "s.myshopify.com", orderId: "gid://shopify/Order/1" } }, create: { staffName: "Sam Patel" }, update: { staffName: "Sam Patel" } });
  });
  it("returns the previous opener and replaces it with this one", async () => {
    const db = { orderOpen: { findUnique: vi.fn(async () => ({ staffName: "Ann Lee", openedAt: new Date("2026-11-22T08:30:00Z") })), upsert: vi.fn(async () => ({})) } };
    expect(await recordOpen(db, args)).toEqual({ name: "Ann Lee", at: "2026-11-22T08:30:00.000Z" });
    expect(db.orderOpen.upsert.mock.calls[0][0].update).toMatchObject({ staffName: "Sam Patel", openedAt: args.now });
  });
});
