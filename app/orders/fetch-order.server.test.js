import { describe, expect, it } from "vitest";
import { gqlLine, gqlOrder, gqlReply } from "./fixtures.js";
import { fetchOrder } from "./fetch-order.server.js";

describe("fetchOrder", () => {
  it("reads every line when the lines come in two pages", async () => {
    const first = gqlOrder({ lineItems: { nodes: [gqlLine(1), gqlLine(2)], pageInfo: { hasNextPage: true, endCursor: "C1" } } });
    const calls = [];
    const graphql = async (query, opts) => {
      calls.push(opts.variables);
      return calls.length === 1
        ? gqlReply({ data: { order: first } })
        : gqlReply({ data: { order: { lineItems: { nodes: [gqlLine(3)], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    };
    const order = await fetchOrder(graphql, "gid://shopify/Order/1");
    expect(order.lineItems.nodes.map((l) => l.id)).toEqual(["gid://shopify/LineItem/1", "gid://shopify/LineItem/2", "gid://shopify/LineItem/3"]);
    expect(calls[1]).toMatchObject({ id: "gid://shopify/Order/1", after: "C1" });
  });

  it("returns null when the order does not exist", async () => {
    expect(await fetchOrder(async () => gqlReply({ data: { order: null } }), "gid://shopify/Order/9")).toBeNull();
  });

  it("throws the GraphQL error so a webhook is retried", async () => {
    await expect(fetchOrder(async () => gqlReply({ errors: [{ message: "Throttled" }] }), "x")).rejects.toThrow("Throttled");
  });
});
