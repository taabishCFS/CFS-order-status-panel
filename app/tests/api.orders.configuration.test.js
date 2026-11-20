import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let configurator;
let versions;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { tag: "db" } }));
vi.mock("../configurator/client.server", async (orig) => ({ ...(await orig()), callConfigurator: (...a) => configurator(...a) }));
vi.mock("../configurator/versions.server", () => ({ currentConfiguration: (...a) => versions(...a) }));

const { loader } = await import("../routes/api.orders.$id.configuration.jsx");
const { ConfiguratorError } = await import("../configurator/client.server");
const req = new Request("https://app.test/api/orders/8420856463699/configuration");

describe("GET /api/orders/:id/configuration", () => {
  beforeEach(() => {
    admin = async () => ({ session: { shop: "s.myshopify.com" }, cors: (r) => r });
    configurator = vi.fn();
    versions = vi.fn(async () => ({ lines: [{ lineItemId: "l1", version: 1 }] }));
  });

  it("returns the order's line configurations for the signed-in shop", async () => {
    const res = await loader({ request: req, params: { id: "8420856463699" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lines: [{ lineItemId: "l1", version: 1 }] });
    const [db, , args] = versions.mock.calls[0];
    expect(db).toEqual({ tag: "db" });
    expect(args).toEqual({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/8420856463699" });
  });

  it("gives the configurator calls the shop, so they are signed for it", async () => {
    versions = vi.fn(async (_db, call) => { await call({ path: "/staff/x" }); return { lines: [] }; });
    configurator.mockResolvedValue({});
    await loader({ request: req, params: { id: "1" } });
    expect(configurator).toHaveBeenCalledWith({ path: "/staff/x", shop: "s.myshopify.com" });
  });

  it("rejects an id that is not a number without reading anything", async () => {
    const res = await loader({ request: req, params: { id: "abc" } });
    expect(res.status).toBe(400);
    expect(versions).not.toHaveBeenCalled();
  });

  it("reports a configurator failure as 502 with its code", async () => {
    versions = async () => { throw new ConfiguratorError({ status: 0, code: "timeout" }); };
    const res = await loader({ request: req, params: { id: "1" } });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "configurator_unavailable", code: "timeout" });
  });

  it("passes the library's 401 through when authentication fails", async () => {
    admin = async () => { throw new Response("Unauthorized", { status: 401 }); };
    const thrown = await loader({ request: req, params: { id: "1" } }).catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(401);
  });
});
