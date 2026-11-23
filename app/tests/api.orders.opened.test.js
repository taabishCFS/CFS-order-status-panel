import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let open;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: {} }));
vi.mock("../orders/order-open.server", () => ({ recordOpen: (...a) => open(...a) }));

const route = await import("../routes/api.orders.$id.opened.jsx");
const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = () => new Request("https://app.test/api/orders/5/opened", { method: "POST" });

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r });
  open = vi.fn(async () => ({ name: "Ann Lee", at: "2026-11-22T08:30:00.000Z" }));
});

describe("POST /api/orders/:id/opened", () => {
  it("returns who opened it before and records the open for the verified staff member", async () => {
    const res = await route.action({ request: post(), params: { id: "5" } });
    expect(await res.json()).toEqual({ ok: true, last: { name: "Ann Lee", at: "2026-11-22T08:30:00.000Z" } });
    expect(open.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/5", staff: { id: "9", name: "Sam Patel" } });
  });
  it("records nothing for an unverified user, a bad id or another method", async () => {
    admin = async () => ({ session: session({ isOnline: false }), cors: (r) => r });
    expect((await route.action({ request: post(), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), cors: (r) => r });
    expect((await route.action({ request: post(), params: { id: "x" } })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/x", { method: "PUT" }), params: { id: "5" } })).status).toBe(405);
    expect(open).not.toHaveBeenCalled();
  });
  it("says so when the record cannot be saved", async () => {
    open = vi.fn(async () => { throw new Error("db down"); });
    expect((await route.action({ request: post(), params: { id: "5" } })).status).toBe(500);
  });
});
