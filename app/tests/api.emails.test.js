import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeOutboxDb } from "../email/fixtures";

let admin;
let queue;
let config;
let tick;
let db;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: new Proxy({}, { get: (_t, key) => db[key] }) }));
vi.mock("../email/queue-order-emails.server", () => ({ queueOrderEmails: (...a) => queue(...a) }));
vi.mock("../email/config.server", () => ({ readMailConfig: () => config }));
vi.mock("../email/worker.server", () => ({ runEmailTick: (...a) => tick(...a) }));

const emails = await import("../routes/api.emails.jsx");
const orderEmails = await import("../routes/api.orders.$id.emails.jsx");
const retry = await import("../routes/api.emails.$id.retry.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body, method = "POST") => new Request("https://app.test/api/emails", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { orderId: "123", statusId: 3, lineIds: ["gid://shopify/LineItem/1"], idempotencyKey: "k1" };
const row = (over = {}) => ({ id: "e1", kind: "customer", templateKey: "status.3", recipient: "jane@example.com", subject: "S", html: "<p>secret html</p>", status: "queued", error: null, ...over });

const fresh = (over = {}) => { const { id, ...rest } = row(over); return rest; };

beforeEach(() => {
  admin = async () => ({ session: session(), admin: {}, cors: (r) => r });
  queue = vi.fn(async () => ({ ok: true, rows: [row()], duplicate: false }));
  config = { enabled: true, mode: "log", reason: null };
  tick = vi.fn(async () => ({}));
  db = fakeOutboxDb();
});

describe("browser preflight for the POST routes", () => {
  for (const [name, route] of [["emails", emails], ["emails retry", retry]]) {
    it(`/api/${name}: a loader answers through authenticate.admin, and a plain GET is 405`, async () => {
      const preflight = new Response(null, { status: 204 });
      admin = async (request) => { if (request.method === "OPTIONS") throw preflight; return { session: session(), cors: (r) => r }; };
      expect(await route.loader({ request: new Request("https://app.test/x", { method: "OPTIONS" }) }).catch((e) => e)).toBe(preflight);
      const res = await route.loader({ request: new Request("https://app.test/x") });
      expect([res.status, (await res.json()).error]).toEqual([405, "method_not_allowed"]);
    });
  }
});

describe("POST /api/emails", () => {
  it("queues the emails as the verified staff member and starts a send pass", async () => {
    const res = await emails.action({ request: post(good) });
    expect([res.status, await res.json()]).toEqual([200, { ok: true, rows: [{ id: "e1", kind: "customer", templateKey: "status.3", recipient: "jane@example.com", subject: "S", status: "queued", error: null }], duplicate: false }]);
    expect(queue.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/123", actor: { id: "9", name: "Sam Patel", source: "verified" }, request: { statusId: 3, idempotencyKey: "k1" } });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("never returns the stored html", async () => {
    const text = await (await emails.action({ request: post(good) })).text();
    expect(text).not.toContain("secret html");
  });

  it("refuses without a verified staff member and queues nothing", async () => {
    admin = async () => ({ session: session({ isOnline: false }), cors: (r) => r });
    const res = await emails.action({ request: post(good) });
    expect([res.status, (await res.json()).error]).toEqual([403, "staff_not_verified"]);
    expect(queue).not.toHaveBeenCalled();
  });

  it("rejects bad JSON, a bad shape and a wrong method", async () => {
    expect((await emails.action({ request: post("{nope") })).status).toBe(400);
    expect((await emails.action({ request: post({ ...good, orderId: "x" }) })).status).toBe(400);
    expect((await emails.action({ request: post(good, "PUT") })).status).toBe(405);
    expect(queue).not.toHaveBeenCalled();
  });

  it("says 409 when email is off, 404 for an unknown order, 422 for an unknown template", async () => {
    for (const [code, status] of [["email_off", 409], ["no_order", 404], ["unknown_template", 422]]) {
      queue.mockResolvedValue({ ok: false, code });
      const res = await emails.action({ request: post(good) });
      expect([res.status, (await res.json()).code]).toEqual([status, code]);
    }
    expect(tick).not.toHaveBeenCalled();
  });

  it("a duplicate request still answers 200 with the existing rows", async () => {
    queue.mockResolvedValue({ ok: true, rows: [row()], duplicate: true });
    const body = await (await emails.action({ request: post(good) })).json();
    expect(body.duplicate).toBe(true);
  });
});

describe("GET /api/orders/:id/emails", () => {
  const ask = (id = "123") => orderEmails.loader({ request: new Request("https://app.test/x"), params: { id } });

  it("lists the order's emails newest first, without the html, with the mode", async () => {
    const older = await db.emailOutbox.create({ data: { ...fresh(), shop: "s.myshopify.com", orderId: "gid://shopify/Order/123", dedupeKey: "a", createdAt: new Date("2026-01-01") } });
    await db.emailOutbox.create({ data: { ...fresh(), shop: "s.myshopify.com", orderId: "gid://shopify/Order/123", dedupeKey: "b", createdAt: new Date("2026-02-01") } });
    await db.emailOutbox.create({ data: { ...fresh(), shop: "other.myshopify.com", orderId: "gid://shopify/Order/123", dedupeKey: "c" } });
    const body = await (await ask()).json();
    expect(body.mode).toBe("log");
    expect(body.enabled).toBe(true);
    expect(body.emails).toHaveLength(2);
    expect(body.emails[1].id).toBe(older.id);
    expect(JSON.stringify(body)).not.toContain("secret html");
  });

  it("rejects a non-numeric order id", async () => {
    expect((await ask("abc")).status).toBe(400);
  });
});

describe("POST /api/emails/:id/retry", () => {
  const go = (id, method = "POST") => retry.action({ request: new Request("https://app.test/x", { method }), params: { id } });

  it("retries only a failed email, and starts a send pass", async () => {
    const failed = await db.emailOutbox.create({ data: { ...fresh(), shop: "s.myshopify.com", orderId: "o", dedupeKey: "f", status: "failed", error: "boom" } });
    const sent = await db.emailOutbox.create({ data: { ...fresh(), shop: "s.myshopify.com", orderId: "o", dedupeKey: "s", status: "sent" } });
    expect(await (await go(sent.id)).json()).toEqual({ error: "not_retryable" });
    const res = await go(failed.id);
    expect([res.status, await res.json()]).toEqual([200, { ok: true }]);
    expect(db.rows.find((r) => r.id === failed.id)).toMatchObject({ status: "queued", error: null });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("refuses without a verified staff member, for another shop's email, and for a bad id", async () => {
    const mine = await db.emailOutbox.create({ data: { ...fresh(), shop: "other.myshopify.com", orderId: "o", dedupeKey: "x", status: "failed" } });
    expect((await go(mine.id)).status).toBe(409);
    admin = async () => ({ session: session({ isOnline: false }), cors: (r) => r });
    expect((await go(mine.id)).status).toBe(403);
    admin = async () => ({ session: session(), cors: (r) => r });
    expect((await go("bad id!")).status).toBe(400);
    expect((await go(mine.id, "PUT")).status).toBe(405);
  });
});
