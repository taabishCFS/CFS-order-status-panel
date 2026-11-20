import { describe, expect, it } from "vitest";
import { fakeDb, gqlOrder, gqlReply } from "./fixtures.js";
import { processOrderWebhook } from "./webhook.server.js";

const graphqlFor = (order) => async () => gqlReply({ data: { order } });
const run = (over) => processOrderWebhook({ db: fakeDb(), graphql: graphqlFor(gqlOrder()), shop: "s", topic: "ORDERS_UPDATED", payload: { admin_graphql_api_id: "gid://shopify/Order/1" }, ...over });

describe("processOrderWebhook", () => {
  it("re-reads the order, saves it and answers 200", async () => {
    const db = fakeDb();
    expect(await run({ db })).toMatchObject({ status: 200, outcome: "saved" });
    expect(db.orders.size).toBe(1);
  });

  it("answers 200 and does nothing when the shop has no stored access", async () => {
    const db = fakeDb();
    expect(await run({ db, graphql: undefined })).toMatchObject({ status: 200, outcome: "no_access" });
    expect(db.orders.size).toBe(0);
  });

  it("answers 200 when the order no longer exists", async () => {
    expect(await run({ graphql: graphqlFor(null) })).toMatchObject({ status: 200, outcome: "order_not_found" });
  });

  it("answers 200 when the payload names no order", async () => {
    expect(await run({ payload: {} })).toMatchObject({ status: 200, outcome: "no_order_id" });
  });

  it("finds the order of a refund by its numeric order id", async () => {
    const seen = [];
    const graphql = async (q, { variables }) => { seen.push(variables.id); return gqlReply({ data: { order: gqlOrder() } }); };
    await run({ graphql, topic: "REFUNDS_CREATE", payload: { id: 5, order_id: 1 } });
    expect(seen[0]).toBe("gid://shopify/Order/1");
  });

  it("answers 500 when the save throws, so Shopify sends it again", async () => {
    const db = fakeDb();
    db.$transaction = async () => { throw new Error("db down"); };
    expect(await run({ db })).toMatchObject({ status: 500 });
  });

  it("answers 500 when Shopify cannot be read", async () => {
    expect(await run({ graphql: async () => gqlReply({ errors: [{ message: "Throttled" }] }) })).toMatchObject({ status: 500 });
  });

  it("answers 200 for a stale copy without changing the stored order", async () => {
    const db = fakeDb();
    await run({ db, graphql: graphqlFor(gqlOrder({ updatedAt: "2026-11-19T12:00:00Z" })) });
    const result = await run({ db, graphql: graphqlFor(gqlOrder({ updatedAt: "2026-11-19T09:00:00Z", displayFinancialStatus: "PENDING" })) });
    expect(result).toMatchObject({ status: 200, outcome: "stale" });
    expect(db.orders.get("s|gid://shopify/Order/1").financialStatus).toBe("PAID");
  });
});
