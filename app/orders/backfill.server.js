// Copies one page of existing Shopify orders into the mirror. A caller loops until hasNext is false.
import { fetchOrder } from "./fetch-order.server.js";
import { mapOrder } from "./map-order.js";
import { upsertOrder } from "./mirror.server.js";

const PAGE_SIZE = 5; // small pages keep each request short (a long one can be cut off by the host as "Failed to fetch")

const LIST_QUERY = `#graphql
  query CfsBackfillOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT) {
      nodes { id }
      pageInfo { hasNextPage endCursor }
    }
  }`;

/** Returns { count, endCursor, hasNext }; count is the orders saved on this page. */
export async function backfillPage({ db, graphql, shop, after }) {
  const body = await (await graphql(LIST_QUERY, { variables: { first: PAGE_SIZE, after: after ?? null } })).json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  const { nodes, pageInfo } = body.data.orders;
  let count = 0;
  for (const { id } of nodes) {
    const order = await fetchOrder(graphql, id);
    if (!order) continue;
    const { outcome } = await upsertOrder(db, mapOrder(shop, order));
    if (outcome === "saved") count += 1;
  }
  return { count, endCursor: pageInfo.endCursor, hasNext: pageInfo.hasNextPage };
}
