import { beforeEach, describe, expect, it, vi } from "vitest";

let built;
const graphql = vi.fn();
vi.mock("../shopify.server", () => ({ unauthenticated: { admin: vi.fn(async () => ({ admin: { graphql } })) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/export-query.server", () => ({ buildExport: (...a) => built(...a) }));

const route = await import("../routes/exports.line.jsx");
const { signExportLink } = await import("../orders/export-link.server.js");

const link = (payload = { shop: "s.myshopify.com", kind: 3, query: "brand=Actona" }, secret = "test-secret", now) => {
  const t = signExportLink(payload, secret, now);
  return new Request(`https://cfs.test/exports/line?t=${encodeURIComponent(t)}`);
};

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = "test-secret";
  built = vi.fn(async () => ({ csv: "A,B\r\n1,2\r\n", count: 1, capped: false, costLookup: "ok" }));
});

describe("GET /exports/line", () => {
  it("serves the csv as a download for a valid link, built with the link's filters", async () => {
    const res = await route.loader({ request: link() });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="orders-export-3-actona-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("A,B\r\n1,2\r\n");
    expect(built.mock.calls[0][0]).toMatchObject({ db: { marker: "db" }, graphql, shop: "s.myshopify.com", kind: 3, params: { brand: "Actona" } });
  });

  it("refuses a missing, forged or expired link without building anything", async () => {
    const old = Date.now() - 10 * 60_000;
    for (const request of [new Request("https://cfs.test/exports/line"), link(undefined, "other"), link(undefined, "test-secret", old)]) {
      const res = await route.loader({ request });
      expect(res.status).toBe(403);
    }
    expect(built).not.toHaveBeenCalled();
  });

  it("refuses a link whose kind is not an export", async () => {
    const res = await route.loader({ request: link({ shop: "s.myshopify.com", kind: 9, query: "" }) });
    expect(res.status).toBe(400);
  });
});
