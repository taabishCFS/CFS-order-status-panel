import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: {} }));
const backfill = vi.fn();
vi.mock("../orders/backfill.server", () => ({ backfillPage: (...a) => backfill(...a) }));

const route = await import("../routes/api.backfill.jsx");

beforeEach(() => {
  backfill.mockReset();
  admin = async () => ({ session: { shop: "s.myshopify.com" }, admin: { graphql: "gql" }, cors: (r) => r });
});

const post = (body) => new Request("https://app.test/api/backfill", { method: "POST", body: JSON.stringify(body) });

describe("/api/backfill", () => {
  it("has a loader so the browser's OPTIONS preflight is answered (without it the dashboard sees 'Failed to fetch')", async () => {
    expect(typeof route.loader).toBe("function");
    const res = await route.loader({ request: new Request("https://app.test/api/backfill", { method: "OPTIONS" }) });
    expect(res.status).toBe(405);
  });
  it("returns the page", async () => {
    backfill.mockResolvedValue({ count: 3, endCursor: "c", hasNext: true });
    const res = await route.action({ request: post({ after: null }) });
    expect(await res.json()).toEqual({ count: 3, endCursor: "c", hasNext: true });
  });
  it("answers a failure with its reason instead of dropping the connection", async () => {
    backfill.mockRejectedValue(new Error("boom"));
    const res = await route.action({ request: post({}) });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "backfill_failed", message: "boom" });
  });
});
