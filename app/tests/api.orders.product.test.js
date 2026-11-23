import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let svc;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../orders/product-change.server", () => ({ searchVariants: (...a) => svc.search(...a), changeProduct: (...a) => svc.change(...a) }));

const route = await import("../routes/api.orders.$id.product.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/orders/5/product", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const V = "gid://shopify/ProductVariant/9";

beforeEach(() => {
  admin = async () => ({ session: session(), admin: { graphql: "gql" }, cors: (r) => r });
  svc = { search: vi.fn(async () => [{ id: V }]), change: vi.fn(async () => ({ from: null, to: "Bergen x 1 = £50.00" })) };
});

describe("GET /api/orders/:id/product", () => {
  it("searches products by the q text", async () => {
    const res = await route.loader({ request: new Request("https://app.test/x?q=oslo"), params: { id: "5" } });
    expect(await res.json()).toEqual({ products: [{ id: V }] });
    expect(svc.search).toHaveBeenCalledWith("gql", "oslo");
  });
  it("says so when Shopify cannot be read", async () => {
    svc.search = vi.fn(async () => { throw new Error("down"); });
    expect((await route.loader({ request: new Request("https://app.test/x?q=a"), params: { id: "5" } })).status).toBe(502);
  });
});

describe("POST /api/orders/:id/product", () => {
  it("adds the product and returns the history text, naming the staff member in the order note", async () => {
    const res = await route.action({ request: post({ variantId: V, quantity: 1 }), params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, from: null, to: "Bergen x 1 = £50.00" });
    const arg = svc.change.mock.calls[0][1];
    expect(arg).toMatchObject({ orderId: "gid://shopify/Order/5", variantId: V, quantity: 1, replaceLineItemId: null });
    expect(arg.note).toBe("Product added by Sam Patel");
  });
  it("words the note as a replacement when a line is swapped", async () => {
    await route.action({ request: post({ variantId: V, quantity: 1, replaceLineItemId: "gid://shopify/LineItem/3" }), params: { id: "5" } });
    expect(svc.change.mock.calls[0][1].note).toBe("Product replaced by Sam Patel");
  });
  it("refuses an unverified staff member, a bad id, bad JSON and bad input", async () => {
    admin = async () => ({ session: session({ isOnline: false }), admin: { graphql: "gql" }, cors: (r) => r });
    expect((await route.action({ request: post({ variantId: V, quantity: 1 }), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), admin: { graphql: "gql" }, cors: (r) => r });
    expect((await route.action({ request: post({ variantId: V, quantity: 1 }), params: { id: "x" } })).status).toBe(400);
    expect((await route.action({ request: post("{"), params: { id: "5" } })).status).toBe(400);
    const bad = await route.action({ request: post({ variantId: V, quantity: 0 }), params: { id: "5" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("bad_quantity");
    expect(svc.change).not.toHaveBeenCalled();
  });
  it("returns Shopify's reason when the edit is refused, and rejects other methods", async () => {
    svc.change = vi.fn(async () => { throw Object.assign(new Error("Variant not found"), { stage: "add" }); });
    const res = await route.action({ request: post({ variantId: V, quantity: 1 }), params: { id: "5" } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "shopify_rejected", message: "Variant not found" });
    expect((await route.action({ request: new Request("https://app.test/x", { method: "PUT" }), params: { id: "5" } })).status).toBe(405);
  });
});
