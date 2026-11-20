import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));

const route = await import("../routes/api.line-export.jsx");
const { verifyExportLink } = await import("../orders/export-link.server.js");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const get = (qs = "") => new Request(`https://app.test/api/line-export${qs}`);

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = "test-secret";
  process.env.SHOPIFY_APP_URL = "https://cfs.test";
  admin = async () => ({ session: session(), cors: (r) => r });
});

describe("GET /api/line-export", () => {
  it("returns a signed download link carrying the shop, kind and filters but not the page", async () => {
    const res = await route.loader({ request: get("?kind=3&brand=Actona&from=2026-11-01&page=4&all=1") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/cfs\.test\/exports\/line\?t=/);
    expect(body.filename).toMatch(/^orders-export-3-actona-\d{4}-\d{2}-\d{2}\.csv$/);
    const token = decodeURIComponent(new URL(body.url).searchParams.get("t"));
    expect(verifyExportLink(token, "test-secret")).toEqual({ ok: true, shop: "s.myshopify.com", kind: 3, query: "brand=Actona&from=2026-11-01" });
  });

  it("names the file without a brand when none is chosen", async () => {
    const res = await route.loader({ request: get("?kind=2") });
    expect((await res.json()).filename).toMatch(/^orders-export-2-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("refuses an unknown export kind", async () => {
    for (const qs of ["", "?kind=1", "?kind=4", "?kind=abc"]) {
      expect((await route.loader({ request: get(qs) })).status).toBe(400);
    }
  });

  it("refuses someone who is not a verified staff member", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), cors: (r) => r });
    const res = await route.loader({ request: get("?kind=2") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "staff_not_verified" });
  });
});
