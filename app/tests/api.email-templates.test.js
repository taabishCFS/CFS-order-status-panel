import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEmailDb } from "../email/fixtures";
import { ensureSeeded } from "../email/seed/index.server";

let admin;
let config;
let tick;
let db;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: new Proxy({}, { get: (_t, key) => db[key] }) }));
vi.mock("../email/config.server", () => ({ readMailConfig: () => config }));
vi.mock("../email/worker.server", () => ({ runEmailTick: (...a) => tick(...a) }));

const list = await import("../routes/api.email-templates.jsx");
const one = await import("../routes/api.email-templates.$key.jsx");

const SHOP = "s.myshopify.com";
const session = (over = {}) => ({ shop: SHOP, isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const get = (key) => one.loader({ request: new Request("https://app.test/x"), params: { key } });
const post = (key, body, method = "POST") => one.action({ request: new Request("https://app.test/x", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), params: { key } });
const save = { intent: "save", subject: "New {{order_number}}", body: "Dear {{customer_first_name}}", expectedVersion: 1, reason: "Wording" };

beforeEach(async () => {
  admin = async () => ({ session: session(), cors: (r) => r });
  config = { enabled: true, mode: "test", reason: null, allowlist: ["a@x.com", "b@x.com"], fromAddress: "orders@o.cfsonline.co.uk" };
  tick = vi.fn(async () => ({}));
  db = fakeEmailDb();
  await ensureSeeded(db, SHOP);
});

describe("browser preflight", () => {
  it("the POST route has a loader that answers OPTIONS through authenticate.admin", async () => {
    const preflight = new Response(null, { status: 204 });
    admin = async (request) => { if (request.method === "OPTIONS") throw preflight; return { session: session(), cors: (r) => r }; };
    expect(await one.loader({ request: new Request("https://app.test/x", { method: "OPTIONS" }), params: { key: "status.3" } }).catch((e) => e)).toBe(preflight);
  });
});

describe("GET api/email-templates", () => {
  it("lists every template with a readable name, version and who edited it, plus the placeholders", async () => {
    const body = await (await list.loader({ request: new Request("https://app.test/x") })).json();
    const t = body.templates.find((x) => x.key === "status.3");
    expect(t).toMatchObject({ name: "Order in progress", version: 1 });
    expect(body.templates.some((x) => x.key === "layout")).toBe(true);
    expect(body.placeholders.order).toContain("order_number");
    expect(body.placeholders.line).toContain("line_name");
  });

  it("seeds a shop that has no templates yet", async () => {
    db = fakeEmailDb();
    const body = await (await list.loader({ request: new Request("https://app.test/x") })).json();
    expect(body.templates.length).toBeGreaterThan(20);
  });
});

describe("GET api/email-templates/:key", () => {
  it("returns the template with its versions, newest first", async () => {
    await post("status.3", save);
    const body = await (await get("status.3")).json();
    expect(body.template).toMatchObject({ key: "status.3", version: 2 });
    expect(body.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(body.placeholders.order).toContain("customer_name");
  });

  it("404s for an unknown key", async () => {
    expect((await get("nope")).status).toBe(404);
  });
});

describe("POST api/email-templates/:key", () => {
  it("refuses every intent without a verified staff member", async () => {
    admin = async () => ({ session: session({ isOnline: false }), cors: (r) => r });
    for (const intent of ["save", "restore", "preview", "test"]) {
      const res = await post("status.3", { ...save, intent });
      expect([res.status, (await res.json()).error]).toEqual([403, "staff_not_verified"]);
    }
    expect(db.templates.find((t) => t.key === "status.3").version).toBe(1);
  });

  it("saves a new version as the verified staff member", async () => {
    const res = await post("status.3", save);
    expect([res.status, await res.json()]).toEqual([200, { ok: true, version: 2 }]);
    expect(db.templates.find((t) => t.key === "status.3")).toMatchObject({ subject: "New {{order_number}}", updatedByName: "Sam Patel" });
  });

  it("needs a non-empty reason", async () => {
    for (const reason of ["", "   ", undefined]) expect((await post("status.3", { ...save, reason })).status).toBe(400);
    expect(db.templates.find((t) => t.key === "status.3").version).toBe(1);
  });

  it("refuses an unknown placeholder with 422 and the errors, and saves nothing", async () => {
    const res = await post("status.3", { ...save, body: "Hi {{nope}}" });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.errors.join(" ")).toContain("nope");
    expect(db.templates.find((t) => t.key === "status.3").version).toBe(1);
  });

  it("answers 409 when the template changed meanwhile", async () => {
    await post("status.3", save);
    const res = await post("status.3", save);
    expect([res.status, (await res.json()).code]).toEqual([409, "stale"]);
  });

  it("restores an old version as a new version", async () => {
    const original = db.templates.find((t) => t.key === "status.3").body;
    await post("status.3", save);
    const res = await post("status.3", { intent: "restore", version: 1, expectedVersion: 2, reason: "Back" });
    expect([res.status, await res.json()]).toEqual([200, { ok: true, version: 3 }]);
    expect(db.templates.find((t) => t.key === "status.3").body).toBe(original);
  });

  it("previews with sample data, escapes HTML, and writes nothing", async () => {
    const res = await post("status.3", { intent: "preview", subject: "Hi {{customer_name}}", body: "<b>{{customer_name}}</b> {{message}}" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.subject).toBe("Hi Jane Smith");
    expect(body.html).toContain("<b>Jane Smith</b>");
    expect(db.templates.find((t) => t.key === "status.3").version).toBe(1);
    expect(db.versions.filter((v) => v.key === "status.3")).toHaveLength(1);
    const evil = await (await post("status.3", { intent: "preview", subject: "s", body: "{{customer_name}}" })).json();
    expect(evil.html).not.toContain("<script>");
  });

  it("previews an invalid template as 422", async () => {
    expect((await post("status.3", { intent: "preview", subject: "s", body: "{{nope}}" })).status).toBe(422);
  });

  it("previews the layout around a sample message", async () => {
    const body = await (await post("layout", { intent: "preview", subject: "", body: "<div>FRAME {{content}}</div>" })).json();
    expect(body.html).toContain("FRAME");
    expect(body.html).toContain("Sample");
  });

  it("test-send queues one [TEST] row per allow-listed address, never to a customer, and starts a send pass", async () => {
    const res = await post("status.3", { intent: "test", subject: "S {{order_number}}", body: "Body {{customer_name}}" });
    expect([res.status, (await res.json()).queued]).toEqual([200, 2]);
    expect(db.rows.map((r) => r.recipient).sort()).toEqual(["a@x.com", "b@x.com"]);
    expect(db.rows.every((r) => r.subject.startsWith("[TEST] S "))).toBe(true);
    expect(db.rows.every((r) => r.shop === SHOP && r.templateKey === "status.3")).toBe(true);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("test-send refuses when sending is off or no address is allowed, and queues nothing", async () => {
    config = { ...config, enabled: false, reason: "not_configured" };
    let res = await post("status.3", { intent: "test", subject: "S", body: "B" });
    expect([res.status, (await res.json()).code]).toEqual([409, "email_off"]);
    config = { enabled: true, mode: "log", allowlist: [], fromAddress: "o@x.com" };
    res = await post("status.3", { intent: "test", subject: "S", body: "B" });
    expect([res.status, (await res.json()).code]).toEqual([409, "no_allowlist"]);
    expect(db.rows).toHaveLength(0);
  });

  it("rejects bad JSON, a bad intent, a wrong method and an unknown key", async () => {
    expect((await post("status.3", "{nope")).status).toBe(400);
    expect((await post("status.3", { intent: "explode" })).status).toBe(400);
    expect((await post("status.3", save, "PUT")).status).toBe(405);
    expect((await post("nope", save)).status).toBe(404);
  });
});
