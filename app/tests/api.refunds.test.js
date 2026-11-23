import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let svc;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/refund-list.server", () => ({
  listRefunds: (...a) => svc.list(...a),
  markRefunded: (...a) => svc.mark(...a),
  setClaimable: (...a) => svc.claim(...a),
  removeRefunds: (...a) => svc.remove(...a),
  addManualRefund: (...a) => svc.add(...a),
}));

const route = await import("../routes/api.refunds.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const manual = { action: "add", clientKey: "k1", reason: "DelayRefund", type: "full", orderName: "1001", amount: "50.00", notes: "Phoned in" };

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r });
  svc = {
    list: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageCount: 1, capped: false, view: "pending" })),
    mark: vi.fn(async () => ({ ok: true, request: { id: "r1", orderId: "gid://shopify/Order/1", orderName: "#1001", amountMinor: 2500, transactionId: "T1" } })),
    claim: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true, count: 2 })),
    add: vi.fn(async () => ({ ok: true, request: { id: "m1" } })),
  };
});

describe("GET /api/refunds", () => {
  it("returns a page of the list using the filters in the query string", async () => {
    const res = await route.loader({ request: new Request("https://app.test/api/refunds?view=refunded&page=2&q=1001") });
    expect((await res.json()).view).toBe("pending");
    expect(svc.list.mock.calls[0][1]).toBe("s.myshopify.com");
    expect(svc.list.mock.calls[0][2]).toMatchObject({ view: "refunded", page: 2, q: "1001" });
  });
});

describe("POST /api/refunds", () => {
  it("marks a request refunded as the verified staff member and returns the request for the history entry", async () => {
    const res = await route.action({ request: post({ action: "markRefunded", id: "r1", transactionId: "T1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, request: { id: "r1", orderId: "gid://shopify/Order/1" } });
    expect(svc.mark.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", id: "r1", transactionId: "T1", actor: { name: "Sam Patel" } });
  });
  it("sets claimable and removes ticked rows", async () => {
    expect((await route.action({ request: post({ action: "claimable", id: "r1", value: "claimable" }) })).status).toBe(200);
    expect(svc.claim.mock.calls[0][1]).toEqual({ shop: "s.myshopify.com", id: "r1", value: "claimable" });
    const res = await route.action({ request: post({ action: "remove", ids: ["r1", "r2"] }) });
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(svc.remove.mock.calls[0][1]).toMatchObject({ ids: ["r1", "r2"], actor: { name: "Sam Patel" } });
  });
  it("adds a manual entry", async () => {
    const res = await route.action({ request: post(manual) });
    expect(await res.json()).toEqual({ ok: true, request: { id: "m1" } });
    expect(svc.add.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", input: { orderName: "1001", amountMinor: 5000, reason: "DelayRefund" }, actor: { name: "Sam Patel" } });
  });
  it("turns each refusal into a clear status", async () => {
    svc.mark = vi.fn(async () => ({ ok: false, code: "already_refunded" }));
    expect((await route.action({ request: post({ action: "markRefunded", id: "r1", transactionId: "T1" }) })).status).toBe(409);
    svc.mark = vi.fn(async () => ({ ok: false, code: "no_request" }));
    expect((await route.action({ request: post({ action: "markRefunded", id: "r1", transactionId: "T1" }) })).status).toBe(404);
    svc.mark = vi.fn(async () => ({ ok: false, code: "bad_transaction_id" }));
    expect((await route.action({ request: post({ action: "markRefunded", id: "r1", transactionId: "" }) })).status).toBe(400);
    svc.claim = vi.fn(async () => ({ ok: false, code: "not_applicable" }));
    expect((await route.action({ request: post({ action: "claimable", id: "r1", value: "claimable" }) })).status).toBe(422);
    svc.add = vi.fn(async () => ({ ok: false, code: "no_order" }));
    const res = await route.action({ request: post(manual) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_order" });
  });
  it("refuses bad bodies, other methods, and staff Shopify will not name", async () => {
    expect((await route.action({ request: post({ action: "zap" }) })).status).toBe(400);
    expect((await route.action({ request: post("not json") })).status).toBe(400);
    expect((await route.action({ request: post({ ...manual, reason: "nope" }) })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/api/refunds", { method: "DELETE" }) })).status).toBe(405);
    admin = async () => ({ session: session({ onlineAccessInfo: undefined }), cors: (r) => r });
    const res = await route.action({ request: post({ action: "remove", ids: ["r1"] }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "staff_not_verified" });
    expect(svc.remove).not.toHaveBeenCalled();
  });
});
