import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
vi.mock("../db.server", () => ({ default: {} }));
vi.mock("../staff/permissions.server", () => ({ recordStaff: async () => null, permissionsFor: async () => ({ restricted: false, keys: ["refunds"], canManage: true }) }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));

const { loader } = await import("../routes/api.whoami.jsx");
const req = new Request("https://app.test/api/whoami");

describe("GET /api/whoami", () => {
  beforeEach(() => { admin = undefined; });

  it("returns the shop and the verified staff member", async () => {
    admin = async () => ({
      session: { shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel", email: "s@x.com" } } },
      cors: (r) => r,
    });
    const res = await loader({ request: req });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shop: "s.myshopify.com", staff: { id: "9", name: "Sam Patel", source: "verified" }, permissions: { restricted: false, keys: ["refunds"], canManage: true } });
  });

  it("returns staff null for an offline session", async () => {
    admin = async () => ({ session: { shop: "s.myshopify.com", isOnline: false }, cors: (r) => r });
    expect((await (await loader({ request: req })).json()).staff).toBeNull();
  });

  it("passes the library's 401 through when authentication fails", async () => {
    admin = async () => { throw new Response("Unauthorized", { status: 401 }); };
    const thrown = await loader({ request: req }).catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(401);
  });
});
