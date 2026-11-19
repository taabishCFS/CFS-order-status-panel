import type { OrderNode } from './rows';

const ENDPOINT = 'shopify:admin/api/graphql.json';
const PAGE_SIZE = 25;

// Read-only. Newest orders first. lineItems(first: 100) matches the existing status panel's limit.
const QUERY = `#graphql
  query CfsOrdersByBrand($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        metafield(namespace: "$app", key: "cfs_status") { value }
        lineItems(first: 100) {
          nodes {
            id title variantTitle sku vendor quantity currentQuantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export async function loadOrdersPage(
  after: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<{ orders: OrderNode[]; nextCursor: string | null }> {
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({ query: QUERY, variables: { first: PAGE_SIZE, after } }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('; '));
  const { nodes, pageInfo } = body.data.orders;
  return { orders: nodes, nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null };
}
