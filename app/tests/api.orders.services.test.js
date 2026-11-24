import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let svc;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: {} }));
let allowed = true;
vi.mock("../staff/permissions.server", () => ({ can: async () => allowed }));
vi.mock("../orders/services.server", () => ({ readServices: (...a) => svc.read(...a), applyServices: (...a) => svc.apply(...a) }));

const route = await import("../routes/api.orders.$id.services.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/orders/5/services", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const current = { currency: "GBP", services: { scotland: { lineItemId: "L2", amountMinor: 2500 } } };

beforeEach(() => {
  admin = async () => ({ session: session(), admin: { graphql: "gql" }, cors: (r) => r });
  svc = { read: vi.fn(async () => current), apply: vi.fn(async () => ({ changed: true })) };
});

describe("GET /api/orders/:id/services", () => {
  it("lists all six services with the amount on the order, or null", async () => {
    const res = await route.loader({ request: new Request("https://app.test/x"), params: { id: "5" } });
    const body = await res.json();
    expect(body.currency).toBe("GBP");
    expect(body.services).toHaveLength(6);
    expect(body.services.find((s) => s.key === "scotland")).toEqual({ key: "scotland", label: "Scotland Delivery", amountMinor: 2500 });
    expect(body.services.find((s) => s.key === "two_man").amountMinor).toBeNull();
    expect(svc.read).toHaveBeenCalledWith("gql", "gid://shopify/Order/5");
  });
  it("says so when Shopify cannot be read", async () => {
    svc.read = vi.fn(async () => { throw new Error("Order not found"); });
    const res = await route.loader({ request: new Request("https://app.test/x"), params: { id: "5" } });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/orders/:id/services", () => {
  it("applies only what changed and returns the changes for the history", async () => {
    const res = await route.action({ request: post({ services: { two_man: "60", scotland: "" } }), params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, changed: true, changes: [{ key: "two_man", label: "Two Man Delivery", from: null, to: 6000 }, { key: "scotland", label: "Scotland Delivery", from: 2500, to: null }] });
    const arg = svc.apply.mock.calls[0][1];
    expect(arg.plan).toEqual({ add: [{ key: "two_man", amountMinor: 6000 }], remove: [{ key: "scotland", lineItemId: "L2" }] });
    expect(arg).toMatchObject({ orderId: "gid://shopify/Order/5", currency: "GBP" });
    expect(arg.note).toContain("Sam Patel");
  });

  it("changes nothing when the panel already matches the order", async () => {
    svc.apply = vi.fn(async () => ({ changed: false }));
    const res = await route.action({ request: post({ services: { scotland: "25.00" } }), params: { id: "5" } });
    expect(await res.json()).toEqual({ ok: true, changed: false, changes: [] });
  });

  it("passes Shopify's refusal back in plain words, with the step that failed", async () => {
    svc.apply = vi.fn(async () => { const e = new Error("Cannot edit a cancelled order"); e.stage = "add"; throw e; });
    const res = await route.action({ request: post({ services: { two_man: "60" } }), params: { id: "5" } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "shopify_rejected", message: "Cannot edit a cancelled order" });
  });

  it("refuses an unverified person, a bad body, a bad id and a wrong method without calling Shopify", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), admin: { graphql: "gql" }, cors: (r) => r });
    expect((await route.action({ request: post({ services: { two_man: "60" } }), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), admin: { graphql: "gql" }, cors: (r) => r });
    expect((await route.action({ request: post("nope"), params: { id: "5" } })).status).toBe(400);
    const bad = await route.action({ request: post({ services: { two_man: "-1" } }), params: { id: "5" } });
    expect(await bad.json()).toEqual({ error: "bad_amount" });
    expect((await route.action({ request: post({ services: { two_man: "60" } }), params: { id: "x" } })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/x", { method: "PUT" }), params: { id: "5" } })).status).toBe(405);
    expect(svc.apply).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders/:id/services permission", () => {
  it("refuses staff without the delivery charges permission before reading Shopify", async () => {
    allowed = false;
    try {
      const res = await route.action({ request: new Request("https://app.test/api/orders/5/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ services: {} }) }), params: { id: "5" } });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("no_permission");
      expect(svc.read).not.toHaveBeenCalled();
    } finally {
      allowed = true;
    }
  });
});
