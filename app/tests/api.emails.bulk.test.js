import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let queued;
let tick;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../email/bulk-email.server", async (orig) => ({ ...(await orig()), queueBulkEmails: (...a) => queued(...a) }));
vi.mock("../email/worker.server", () => ({ runEmailTick: (...a) => tick(...a) }));

const route = await import("../routes/api.emails.bulk.jsx");

const L = (n) => `gid://shopify/LineItem/${n}`;
const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/emails/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { lineIds: [L(1)], subject: "S", message: "M", idempotencyKey: "k1" };

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r });
  queued = vi.fn(async () => ({ ok: true, customers: 2, orders: 3, withoutEmail: 1, rows: [{ id: "e1" }], duplicate: false }));
  tick = vi.fn(async () => ({}));
});

describe("POST /api/emails/bulk", () => {
  it("queues the bulk email for the session shop as the verified staff member and sends now", async () => {
    const res = await route.action({ request: post(good) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, customers: 2, orders: 3, withoutEmail: 1, duplicate: false });
    const args = queued.mock.calls[0][1];
    expect(args).toMatchObject({ shop: "s.myshopify.com", actor: { name: "Sam Patel" }, request: { lineIds: [L(1)], subject: "S", message: "M", dryRun: false } });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("a preview returns the recipients and starts no send", async () => {
    queued = vi.fn(async () => ({ ok: true, customers: 1, orders: 1, withoutEmail: 0, recipients: [{ email: "a@b.c", name: "A", orders: ["#1"] }] }));
    const res = await route.action({ request: post({ ...good, dryRun: true }) });
    expect(await res.json()).toMatchObject({ ok: true, recipients: [{ email: "a@b.c" }] });
    expect(tick).not.toHaveBeenCalled();
  });

  it("explains a refusal with its code and a sensible status", async () => {
    const cases = [["email_off", 409], ["no_lines", 404], ["no_recipients", 422], ["bad_subject", 422], ["unknown_template", 422]];
    for (const [code, status] of cases) {
      queued = vi.fn(async () => ({ ok: false, code, errors: ["x"], withoutEmail: 2 }));
      const res = await route.action({ request: post(good) });
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ ok: false, code });
    }
    expect(tick).not.toHaveBeenCalled();
  });

  it("refuses an unverified person, a bad body and a wrong method without queueing", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), cors: (r) => r });
    expect((await route.action({ request: post(good) })).status).toBe(403);
    admin = async () => ({ session: session(), cors: (r) => r });
    expect((await route.action({ request: post("not json") })).status).toBe(400);
    expect((await route.action({ request: post({ ...good, lineIds: [] }) })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/api/emails/bulk", { method: "PUT" }) })).status).toBe(405);
    expect(queued).not.toHaveBeenCalled();
  });

  it("answers the preflight loader with 405", async () => {
    const res = await route.loader({ request: new Request("https://app.test/api/emails/bulk", { method: "OPTIONS" }) });
    expect(res.status).toBe(405);
  });
});
