import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let configurator;
let preview;
let apply;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { tag: "db" } }));
vi.mock("../configurator/client.server", async (orig) => ({ ...(await orig()), callConfigurator: (...a) => configurator(...a) }));
vi.mock("../configurator/apply.server", () => ({ previewChange: (...a) => preview(...a), applyConfiguration: (...a) => apply(...a) }));

const choices = await import("../routes/api.lines.choices.jsx");
const quote = await import("../routes/api.lines.quote.jsx");
const configuration = await import("../routes/api.lines.configuration.jsx");
const { ConfiguratorError } = await import("../configurator/client.server");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body, method = "POST") => new Request("https://app.test/api/lines/x", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { orderId: "1", lineItemId: "gid://shopify/LineItem/2", choiceIds: ["17020886"], quantities: {}, expectedVersion: 1, reason: "Asked" };
const graphql = () => {};

beforeEach(() => {
  admin = async () => ({ session: session(), admin: { graphql }, cors: (r) => r });
  configurator = vi.fn(async () => ({ ok: true }));
  preview = vi.fn(async () => ({ ok: true, version: 1, currentUnitMinor: 100, newUnitMinor: 150, deltaMinor: 100, same: false, configuration: { options: [{ cfsId: "1" }] } }));
  apply = vi.fn(async () => ({ outcome: "applied", version: 2, deltaMinor: 100 }));
});

// The extension calls these POST routes from the browser. The browser first sends an OPTIONS
// preflight, which React Router hands to a route's loader; without one the preflight fails and the
// browser reports "Failed to fetch".
describe("browser preflight for the POST routes", () => {
  for (const [name, route] of [["quote", quote], ["configuration", configuration]]) {
    it(`/api/lines/${name}: a loader answers through authenticate.admin, so the library can reply to OPTIONS`, async () => {
      const preflight = new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
      admin = async (request) => { if (request.method === "OPTIONS") throw preflight; return { session: session(), admin: { graphql }, cors: (r) => r }; };
      const thrown = await route.loader({ request: new Request("https://app.test/api/lines/x", { method: "OPTIONS" }) }).catch((e) => e);
      expect(thrown).toBe(preflight);
    });

    it(`/api/lines/${name}: a plain GET is refused with 405`, async () => {
      const res = await route.loader({ request: new Request("https://app.test/api/lines/x") });
      expect([res.status, (await res.json()).error]).toEqual([405, "method_not_allowed"]);
    });
  }
});

describe("GET /api/lines/choices", () => {
  const ask = (product) => choices.loader({ request: new Request(`https://app.test/api/lines/choices${product === undefined ? "" : `?product=${product}`}`) });

  it("relays the configurator's choices for the signed-in shop", async () => {
    configurator.mockResolvedValue({ ok: true, groups: [], choices: [] });
    const res = await ask("11067852980563");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, groups: [], choices: [] });
    expect(configurator).toHaveBeenCalledWith({ shop: "s.myshopify.com", path: "/staff/choices?product=11067852980563" });
  });

  it("rejects a product id that is not numeric without calling the configurator", async () => {
    for (const p of ["abc", "1;x", "", undefined]) expect((await ask(p)).status).toBe(400);
    expect(configurator).not.toHaveBeenCalled();
  });

  it("keeps the configurator's 404 and 422, and reports anything else as 502", async () => {
    configurator.mockRejectedValue(new ConfiguratorError({ status: 422, code: "unsupported_product" }));
    expect([(await ask("1")).status, (await (await ask("1")).json()).error]).toEqual([422, "unsupported_product"]);
    configurator.mockRejectedValue(new ConfiguratorError({ status: 0, code: "timeout" }));
    const res = await ask("1");
    expect([res.status, (await res.json()).error]).toEqual([502, "configurator_unavailable"]);
  });
});

describe("POST /api/lines/quote", () => {
  it("prices the selection for the saved line and returns the difference", async () => {
    const res = await quote.action({ request: post(good) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 1, currentUnitMinor: 100, newUnitMinor: 150, deltaMinor: 100, same: false, options: [{ cfsId: "1" }] });
    expect(preview.mock.calls[0][0]).toMatchObject({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/1", lineItemId: "gid://shopify/LineItem/2", choiceIds: ["17020886"], quantities: {} });
  });

  it("gives the engine's refusal as 422", async () => {
    preview.mockResolvedValue({ ok: false, outcome: "invalid", message: "invalid_combination" });
    const res = await quote.action({ request: post(good) });
    expect([res.status, await res.json()]).toEqual([422, { ok: false, outcome: "invalid", message: "invalid_combination" }]);
  });

  it("rejects bad JSON, a bad shape and a wrong method", async () => {
    expect((await quote.action({ request: post("{not json") })).status).toBe(400);
    expect((await quote.action({ request: post({ ...good, orderId: "x" }) })).status).toBe(400);
    expect((await quote.action({ request: post(good, "PUT") })).status).toBe(405);
    expect(preview).not.toHaveBeenCalled();
  });

  it("reports a configurator outage as 502", async () => {
    preview.mockRejectedValue(new ConfiguratorError({ status: 0, code: "timeout" }));
    const res = await quote.action({ request: post(good) });
    expect([res.status, (await res.json()).error]).toEqual([502, "configurator_unavailable"]);
  });
});

describe("POST /api/lines/configuration", () => {
  it("applies the change as the verified staff member and returns the outcome", async () => {
    const res = await configuration.action({ request: post(good) });
    expect([res.status, await res.json()]).toEqual([200, { outcome: "applied", version: 2, deltaMinor: 100 }]);
    const args = apply.mock.calls[0][0];
    expect(args).toMatchObject({ shop: "s.myshopify.com", staff: { id: "9", name: "Sam Patel", source: "verified" }, orderId: "gid://shopify/Order/1", lineItemId: "gid://shopify/LineItem/2", expectedVersion: 1, reason: "Asked" });
    expect(args.graphql).toBe(graphql);
  });

  it("refuses without a verified staff member and applies nothing", async () => {
    admin = async () => ({ session: session({ isOnline: false }), admin: { graphql }, cors: (r) => r });
    const res = await configuration.action({ request: post(good) });
    expect([res.status, (await res.json()).error]).toEqual([403, "staff_not_verified"]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("requires the version the page was showing", async () => {
    const { expectedVersion, ...noVersion } = good;
    const res = await configuration.action({ request: post(noVersion) });
    expect(res.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("maps each outcome to its status", async () => {
    for (const [outcome, status] of [["stale", 409], ["not_editable", 409], ["invalid", 422], ["failed", 502], ["unchanged", 200]]) {
      apply.mockResolvedValue({ outcome });
      expect((await configuration.action({ request: post(good) })).status).toBe(status);
    }
  });

  it("passes the library's 401 through when authentication fails", async () => {
    admin = async () => { throw new Response("Unauthorized", { status: 401 }); };
    const thrown = await configuration.action({ request: post(good) }).catch((e) => e);
    expect(thrown.status).toBe(401);
  });
});
