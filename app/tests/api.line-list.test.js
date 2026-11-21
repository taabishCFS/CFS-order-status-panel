import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let lookup;
let listed;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/list-query.server", () => ({ listLines: async () => listed }));
vi.mock("../orders/stock-lookup.server", () => ({ lookupStock: (...a) => lookup(...a) }));

const route = await import("../routes/api.line-list.jsx");
const V1 = "gid://shopify/ProductVariant/1";

beforeEach(() => {
  admin = async () => ({ session: { shop: "s.myshopify.com" }, admin: { graphql: "gql" }, cors: (r) => r });
  listed = { rows: [{ lineId: "a", variantId: V1 }], summary: { lines: 1, orders: 1, units: 1 }, total: 1, page: 1, pageCount: 1, capped: false };
  lookup = vi.fn(async () => new Map([[V1, { status: "OUT OF STOCK", dueDate: null, inventory: 0, tracked: true }]]));
});

describe("GET /api/line-list", () => {
  it("adds the stock tint to each row", async () => {
    const res = await route.loader({ request: new Request("https://app.test/api/line-list") });
    const body = await res.json();
    expect(lookup).toHaveBeenCalledWith("gql", [V1]);
    expect(body.rows[0]).toMatchObject({ stockTint: "red", stockDueDate: null });
    expect(body.stockLookup).toBe("ok");
  });

  it("still returns the list, untinted, when Shopify cannot be read", async () => {
    lookup = vi.fn(async () => { throw new Error("Access denied"); });
    const res = await route.loader({ request: new Request("https://app.test/api/line-list") });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows[0]).toMatchObject({ stockTint: null });
    expect(body.stockLookup).toBe("unavailable");
  });
});
