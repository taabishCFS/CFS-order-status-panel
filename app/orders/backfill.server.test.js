import { describe, expect, it } from "vitest";
import { fakeDb, gqlOrder, gqlReply } from "./fixtures.js";
import { backfillPage } from "./backfill.server.js";

// A fake Shopify: a list query that pages two ids per page, and a single-order query.
function shopify(ids) {
  return async (query, { variables }) => {
    if (variables.id) return gqlReply({ data: { order: gqlOrder({ id: variables.id, name: `#${variables.id.split("/").pop()}` }) } });
    const start = variables.after ? Number(variables.after) : 0;
    const slice = ids.slice(start, start + 2);
    const end = start + slice.length;
    return gqlReply({ data: { orders: { nodes: slice.map((id) => ({ id })), pageInfo: { hasNextPage: end < ids.length, endCursor: slice.length ? String(end) : null } } } });
  };
}

describe("backfillPage", () => {
  const ids = ["gid://shopify/Order/1", "gid://shopify/Order/2", "gid://shopify/Order/3"];

  it("saves one page and reports the cursor", async () => {
    const db = fakeDb();
    const page = await backfillPage({ db, graphql: shopify(ids), shop: "s", after: null });
    expect(page).toEqual({ count: 2, endCursor: "2", hasNext: true });
    expect(db.orders.size).toBe(2);
  });

  it("pages through to the end", async () => {
    const db = fakeDb();
    const g = shopify(ids);
    const first = await backfillPage({ db, graphql: g, shop: "s", after: null });
    const second = await backfillPage({ db, graphql: g, shop: "s", after: first.endCursor });
    expect(second).toEqual({ count: 1, endCursor: "3", hasNext: false });
    expect(db.orders.size).toBe(3);
  });

  it("returns an empty page for a store with no orders", async () => {
    expect(await backfillPage({ db: fakeDb(), graphql: shopify([]), shop: "s", after: null })).toEqual({ count: 0, endCursor: null, hasNext: false });
  });
});
