// Reads one order from the Admin API with every line, however many pages the lines take.
const MONEY = "shopMoney { amount currencyCode }";
const LINES = `lineItems(first: 100, after: $after) {
  nodes {
    id title variantTitle sku vendor quantity
    originalUnitPriceSet { ${MONEY} }
    totalDiscountSet { ${MONEY} }
    customAttributes { key value }
  }
  pageInfo { hasNextPage endCursor }
}`;
const ADDRESS = "name address1 address2 city province zip countryCodeV2 phone";

const ORDER_QUERY = `#graphql
  query CfsMirrorOrder($id: ID!, $after: String) {
    order(id: $id) {
      id name createdAt updatedAt cancelledAt displayFinancialStatus sourceName tags email phone paymentGatewayNames
      totalOutstandingSet { ${MONEY} }
      totalRefundedSet { ${MONEY} }
      metafield(namespace: "$app", key: "cfs_status") { value }
      shippingAddress { ${ADDRESS} }
      billingAddress { ${ADDRESS} }
      subtotalPriceSet { ${MONEY} }
      totalDiscountsSet { ${MONEY} }
      totalShippingPriceSet { ${MONEY} }
      totalPriceSet { ${MONEY} }
      ${LINES}
    }
  }`;

const MORE_LINES_QUERY = `#graphql
  query CfsMirrorOrderLines($id: ID!, $after: String) {
    order(id: $id) { ${LINES} }
  }`;

async function run(graphql, query, variables) {
  const body = await (await graphql(query, { variables })).json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

/** The order with all its lines, or null when Shopify has no such order. Throws on any Shopify error. */
export async function fetchOrder(graphql, id) {
  const order = (await run(graphql, ORDER_QUERY, { id })).order;
  if (!order) return null;
  const nodes = [...order.lineItems.nodes];
  let { hasNextPage, endCursor } = order.lineItems.pageInfo;
  while (hasNextPage) {
    if (!endCursor) throw new Error(`Order ${id}: Shopify reported more lines but gave no cursor`);
    const more = (await run(graphql, MORE_LINES_QUERY, { id, after: endCursor })).order;
    if (!more) throw new Error(`Order ${id} disappeared while its lines were being read`);
    nodes.push(...more.lineItems.nodes);
    ({ hasNextPage, endCursor } = more.lineItems.pageInfo);
  }
  return { ...order, lineItems: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } };
}
