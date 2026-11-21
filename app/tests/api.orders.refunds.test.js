import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let svc;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/refund-request.server", () => ({ addRefundRequest: (...a) => svc.add(...a), listRefundRequests: (...a) => svc.list(...a) }));

const route = await import("../routes/api.orders.$id.refunds.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/orders/5/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { clientKey: "k1", reason: "DamagedPartRefund", type: "part", amount: "25.00", lineIds: [], notes: "x" };

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r });
  svc = {
    list: vi.fn(async () => ({ requests: [{ id: "r1" }], refundableMinor: 5000 })),
    add: vi.fn(async () => ({ ok: true, request: { id: "r1" } })),
  };
});

describe("GET /api/orders/:id/refunds", () => {
  it("returns the requests and what is still refundable", async () => {
    const res = await route.loader({ request: new Request("https://app.test/x"), params: { id: "5" } });
    expect(await res.json()).toEqual({ requests: [{ id: "r1" }], refundableMinor: 5000 });
    expect(svc.list.mock.calls[0].slice(1)).toEqual(["s.myshopify.com", "gid://shopify/Order/5"]);
  });
  it("refuses an order id that is not a number", async () => {
    expect((await route.loader({ request: new Request("https://app.test/x"), params: { id: "abc" } })).status).toBe(400);
  });
});

describe("POST /api/orders/:id/refunds", () => {
  it("adds the request as the verified staff member", async () => {
    const res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, request: { id: "r1" } });
    expect(svc.add.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/5", actor: { name: "Sam Patel" }, input: { reason: "DamagedPartRefund", amountMinor: 2500 } });
  });

  it("explains each refusal: too much (with the limit), no order copy, no such line", async () => {
    svc.add = vi.fn(async () => ({ ok: false, code: "too_much", refundableMinor: 1000 }));
    let res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "too_much", refundableMinor: 1000 });
    svc.add = vi.fn(async () => ({ ok: false, code: "no_order" }));
    res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_order" });
    svc.add = vi.fn(async () => ({ ok: false, code: "no_line" }));
    expect((await route.action({ request: post(good), params: { id: "5" } })).status).toBe(404);
  });

  it("refuses an unverified person, a bad body, a bad id and a wrong method without saving", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), cors: (r) => r });
    expect((await route.action({ request: post(good), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), cors: (r) => r });
    expect((await route.action({ request: post("nope"), params: { id: "5" } })).status).toBe(400);
    const bad = await route.action({ request: post({ ...good, reason: "Nope" }), params: { id: "5" } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad_reason" });
    expect((await route.action({ request: post(good), params: { id: "x" } })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/x", { method: "PUT" }), params: { id: "5" } })).status).toBe(405);
    expect(svc.add).not.toHaveBeenCalled();
  });
});
