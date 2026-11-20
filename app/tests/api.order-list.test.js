import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let q;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/list-query.server", () => ({
  listOrders: (...a) => q.listOrders(...a),
  listLines: (...a) => q.listLines(...a),
  listBrands: (...a) => q.listBrands(...a),
  archiveOrders: (...a) => q.archiveOrders(...a),
}));

const orderList = await import("../routes/api.order-list.jsx");
const lineList = await import("../routes/api.line-list.jsx");
const brands = await import("../routes/api.brands.jsx");
const archive = await import("../routes/api.orders.archive.jsx");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const get = (qs = "") => new Request(`https://app.test/api/x${qs}`);
const post = (body) => new Request("https://app.test/api/orders/archive", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r });
  q = {
    listOrders: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageCount: 1, capped: false })),
    listLines: vi.fn(async () => ({ rows: [], summary: { lines: 0, orders: 0, units: 0 }, capped: false })),
    listBrands: vi.fn(async () => ["Actona"]),
    archiveOrders: vi.fn(async () => ({ count: 2 })),
  };
});

describe("GET /api/order-list", () => {
  it("passes the session shop and the parsed filters to the query and returns its result", async () => {
    const res = await orderList.loader({ request: get("?page=2&brand=Actona&q=smith&from=2026-11-01") });
    expect(await res.json()).toMatchObject({ total: 0, pageCount: 1 });
    const [, shop, params] = q.listOrders.mock.calls[0];
    expect(shop).toBe("s.myshopify.com");
    expect(params).toMatchObject({ page: 2, brand: "Actona", q: "smith", from: "2026-11-01" });
  });

  it("refuses a request that is not authenticated", async () => {
    admin = async () => { throw new Response(null, { status: 401 }); };
    await expect(orderList.loader({ request: get() })).rejects.toMatchObject({ status: 401 });
    expect(q.listOrders).not.toHaveBeenCalled();
  });
});

describe("GET /api/line-list and /api/brands", () => {
  it("returns the line list for the session shop", async () => {
    const res = await lineList.loader({ request: get("?statusId=3&insurance=1") });
    expect((await res.json()).summary).toEqual({ lines: 0, orders: 0, units: 0 });
    expect(q.listLines.mock.calls[0][1]).toBe("s.myshopify.com");
    expect(q.listLines.mock.calls[0][2]).toMatchObject({ statusId: 3, insurance: true });
  });

  it("returns the brands for the session shop", async () => {
    const res = await brands.loader({ request: get() });
    expect(await res.json()).toEqual({ brands: ["Actona"] });
    expect(q.listBrands.mock.calls[0][1]).toBe("s.myshopify.com");
  });
});

describe("POST /api/orders/archive", () => {
  const good = { orderIds: ["gid://shopify/Order/1", "gid://shopify/Order/2"], archived: true };

  it("archives the orders for the session shop and returns the count", async () => {
    const res = await archive.action({ request: post(good) });
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(q.archiveOrders).toHaveBeenCalledWith(expect.anything(), "s.myshopify.com", good.orderIds, true);
  });

  it("refuses without a verified staff member", async () => {
    admin = async () => ({ session: session({ onlineAccessInfo: undefined, isOnline: false }), cors: (r) => r });
    const res = await archive.action({ request: post(good) });
    expect(res.status).toBe(403);
    expect(q.archiveOrders).not.toHaveBeenCalled();
  });

  it("rejects none, too many, non-gid ids, a non-boolean flag and bad JSON", async () => {
    for (const body of [{ ...good, orderIds: [] }, { ...good, orderIds: Array.from({ length: 201 }, (_, i) => `gid://shopify/Order/${i}`) }, { ...good, orderIds: ["x"] }, { ...good, archived: "yes" }, "{nope"]) {
      expect((await archive.action({ request: post(body) })).status).toBe(400);
    }
    expect(q.archiveOrders).not.toHaveBeenCalled();
  });

  it("only accepts POST and has a loader that authenticates for the preflight", async () => {
    expect((await archive.action({ request: new Request("https://app.test/x", { method: "GET" }) })).status).toBe(405);
    const seen = vi.fn(admin);
    admin = seen;
    await archive.loader({ request: get() });
    expect(seen).toHaveBeenCalled();
  });
});
