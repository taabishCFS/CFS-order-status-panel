import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let update;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../orders/order-contact.server", () => ({ updateOrderContact: (...a) => update(...a) }));

const route = await import("../routes/api.orders.$id.contact.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/orders/5/contact", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { email: "a@example.com", shippingAddress: { name: "Donna F", address1: "19 Portland Place", city: "Retford", zip: "WV14 9TB", countryCode: "GB" } };
const graphql = vi.fn();

beforeEach(() => {
  admin = async () => ({ session: session(), admin: { graphql }, cors: (r) => r });
  update = vi.fn(async () => ({ ok: true }));
});

describe("POST /api/orders/:id/contact", () => {
  it("updates the order as verified staff", async () => {
    const res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(graphql, "gid://shopify/Order/5", expect.objectContaining({ email: "a@example.com", shippingAddress: expect.objectContaining({ fullName: "Donna F", countryCode: "GB" }) }));
  });

  it("passes Shopify's refusal back in plain words", async () => {
    update = vi.fn(async () => ({ ok: false, message: "Zip is not valid for GB" }));
    const res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "shopify_rejected", message: "Zip is not valid for GB" });
  });

  it("refuses an unverified person, a bad body, a bad id and a wrong method without calling Shopify", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), admin: { graphql }, cors: (r) => r });
    expect((await route.action({ request: post(good), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), admin: { graphql }, cors: (r) => r });
    expect((await route.action({ request: post("nope"), params: { id: "5" } })).status).toBe(400);
    const bad = await route.action({ request: post({ email: "x" }), params: { id: "5" } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad_email" });
    expect((await route.action({ request: post(good), params: { id: "x" } })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/x", { method: "PUT" }), params: { id: "5" } })).status).toBe(405);
    expect(update).not.toHaveBeenCalled();
  });

  it("answers the preflight loader with method not allowed", async () => {
    const res = await route.loader({ request: new Request("https://app.test/x"), params: { id: "5" } });
    expect(res.status).toBe(405);
  });
});
