import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let fetchOrder;
let upsert;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: {} }));
vi.mock("../orders/fetch-order.server", () => ({ fetchOrder: (...a) => fetchOrder(...a) }));
vi.mock("../orders/mirror.server", () => ({ upsertOrder: (...a) => upsert(...a) }));

const route = await import("../routes/api.orders.$id.sync.jsx");
const post = () => new Request("https://app.test/api/orders/1/sync", { method: "POST" });
const params = { id: "8385315275091" };

beforeEach(() => {
  admin = async () => ({ session: { shop: "s.myshopify.com" }, admin: { graphql: () => {} }, cors: (r) => r });
  fetchOrder = vi.fn(async () => ({ id: "gid://shopify/Order/8385315275091", name: "#1035", createdAt: "2026-11-18T15:14:12Z", updatedAt: "2026-11-19T10:00:00Z", total: {}, lineItems: { nodes: [] } }));
  upsert = vi.fn(async () => ({ outcome: "saved" }));
});

describe("POST /api/orders/:id/sync", () => {
  it("re-reads the order from Shopify and saves it", async () => {
    const res = await route.action({ request: post(), params });
    expect(await res.json()).toEqual({ ok: true, outcome: "saved" });
    expect(fetchOrder).toHaveBeenCalledWith(expect.anything(), "gid://shopify/Order/8385315275091");
    expect(upsert.mock.calls[0][1].order.shop).toBe("s.myshopify.com");
  });

  it("answers 404 for an order Shopify does not have", async () => {
    fetchOrder = async () => null;
    const res = await route.action({ request: post(), params });
    expect(res.status).toBe(404);
  });

  it("answers 502 when Shopify fails", async () => {
    fetchOrder = async () => { throw new Error("boom"); };
    const res = await route.action({ request: post(), params });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "shopify_unavailable" });
  });

  it("refuses a bad id and other methods", async () => {
    expect((await route.action({ request: post(), params: { id: "abc" } })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/x", { method: "GET" }), params })).status).toBe(405);
  });

  it("has a loader that authenticates, so the browser preflight is answered", async () => {
    const seen = vi.fn(admin);
    admin = seen;
    const res = await route.loader({ request: new Request("https://app.test/x", { method: "OPTIONS" }), params });
    expect(seen).toHaveBeenCalled();
    expect(res.status).toBe(405);
  });
});
