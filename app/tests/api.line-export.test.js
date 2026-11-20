import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let built;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/export-query.server", () => ({ buildExport: (...a) => built(...a) }));

const route = await import("../routes/api.line-export.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const get = (qs = "") => new Request(`https://app.test/api/line-export${qs}`);
const graphql = vi.fn();

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r, admin: { graphql } });
  built = vi.fn(async () => ({ csv: "A\r\n", count: 1, capped: false, costLookup: "ok" }));
});

describe("GET /api/line-export", () => {
  it("builds the export for the session shop with the list filters and returns the csv with a file name", async () => {
    const res = await route.loader({ request: get("?kind=3&brand=Actona&from=2026-11-01&page=4") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ csv: "A\r\n", count: 1, capped: false, costLookup: "ok", filename: expect.stringMatching(/^orders-export-3-actona-\d{4}-\d{2}-\d{2}\.csv$/) });
    expect(built.mock.calls[0][0]).toMatchObject({ db: { marker: "db" }, graphql, shop: "s.myshopify.com", kind: 3, params: { brand: "Actona", from: "2026-11-01" } });
  });

  it("names the file without a brand when none is chosen", async () => {
    const res = await route.loader({ request: get("?kind=2") });
    expect((await res.json()).filename).toMatch(/^orders-export-2-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("refuses an unknown export kind", async () => {
    for (const qs of ["", "?kind=1", "?kind=4", "?kind=abc"]) {
      const res = await route.loader({ request: get(qs) });
      expect(res.status).toBe(400);
    }
    expect(built).not.toHaveBeenCalled();
  });

  it("refuses someone who is not a verified staff member", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), cors: (r) => r, admin: { graphql } });
    const res = await route.loader({ request: get("?kind=2") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "staff_not_verified" });
    expect(built).not.toHaveBeenCalled();
  });
});
