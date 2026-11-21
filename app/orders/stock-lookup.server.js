// Reads each variant's stock state from Shopify: the product's In/Out Stock Status and Due Date fields (namespace cfs_stock)
// and the variant's inventory. Read live, so a tint goes away as soon as stock is back.
const BATCH = 100;
const QUERY = `#graphql
  query CfsStock($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryQuantity
        inventoryItem { tracked }
        product {
          stock: metafield(namespace: "cfs_stock", key: "in_out_stock_status") { value }
          due: metafield(namespace: "cfs_stock", key: "due_date") { value }
        }
      }
    }
  }`;

/** Map of variant id -> { status, dueDate, inventory, tracked }. Throws when Shopify reports an error. */
export async function lookupStock(graphql, variantIds) {
  const found = new Map();
  const ids = [...new Set(variantIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += BATCH) {
    const body = await (await graphql(QUERY, { variables: { ids: ids.slice(i, i + BATCH) } })).json();
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
    for (const n of body.data.nodes) {
      if (!n?.id) continue;
      found.set(n.id, {
        status: n.product?.stock?.value ?? null,
        dueDate: n.product?.due?.value ?? null,
        inventory: n.inventoryQuantity ?? null,
        tracked: n.inventoryItem?.tracked === true,
      });
    }
  }
  return found;
}
