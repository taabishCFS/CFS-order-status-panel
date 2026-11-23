// Adds a product to a Shopify order, or swaps an existing line for it, in one order edit.
// Shopify then works out the new total and the balance, the same as an edit in the Shopify admin; the customer is not emailed.
import { BEGIN, COMMIT, OrderEditError, run } from "./order-edit.server.js";
import { lineText } from "./product-change.js";

const SEARCH = `#graphql
  query CfsProductSearch($query: String!) {
    productVariants(first: 20, query: $query) {
      nodes { id title sku price product { title } }
    }
  }`;
const LINE = `#graphql
  query CfsReplacedLine($id: ID!) {
    order(id: $id) {
      cancelledAt
      lineItems(first: 250) { nodes { id title variantTitle currentQuantity originalUnitPriceSet { shopMoney { amount } } } }
    }
  }`;
const ADD = `#graphql
  mutation CfsAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
    orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity, allowDuplicates: true) {
      calculatedLineItem { id title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } } userErrors { field message }
    }
  }`;
const REMOVE = `#graphql
  mutation CfsRemoveLine($id: ID!, $lineItemId: ID!, $quantity: Int!) {
    orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) { calculatedLineItem { id } userErrors { field message } }
  }`;

const toMinor = (amount) => Math.round(Number(amount) * 100);
const numericId = (gid) => String(gid).split("/").at(-1);

/** Variants matching the text (title, SKU), for the picker. [] for a blank search. Throws OrderEditError if Shopify cannot be read. */
export async function searchVariants(graphql, text) {
  const q = String(text ?? "").trim().slice(0, 80);
  if (!q) return [];
  const json = await (await graphql(SEARCH, { variables: { query: q } })).json();
  if (json.errors?.length) throw new OrderEditError(json.errors[0].message ?? "Shopify error", "search");
  return (json.data?.productVariants?.nodes ?? []).map((v) => ({
    id: v.id, productTitle: v.product?.title ?? "", variantTitle: v.title ?? "", sku: v.sku ?? "", priceMinor: toMinor(v.price),
  }));
}

/** { variantId, quantity, replaceLineItemId } -> { from, to } text for the history. Nothing is committed unless every step worked. */
export async function changeProduct(graphql, { orderId, variantId, quantity, replaceLineItemId, note }) {
  let from = null;
  let replaceCalc = null;
  if (replaceLineItemId) {
    const json = await (await graphql(LINE, { variables: { id: orderId } })).json();
    if (json.errors?.length) throw new OrderEditError(json.errors[0].message ?? "Shopify error", "read");
    const order = json.data?.order;
    if (!order) throw new OrderEditError("Order not found", "read");
    if (order.cancelledAt) throw new OrderEditError("The order is cancelled", "read");
    const line = order.lineItems.nodes.find((n) => n.id === replaceLineItemId);
    if (!line || line.currentQuantity < 1) throw new OrderEditError("That line is no longer on the order", "read");
    from = lineText({ title: line.title, variantTitle: line.variantTitle, quantity: line.currentQuantity, totalMinor: toMinor(line.originalUnitPriceSet.shopMoney.amount) * line.currentQuantity });
    replaceCalc = `gid://shopify/CalculatedLineItem/${numericId(line.id)}`;
  }

  const begin = await run(graphql, "begin", BEGIN, { id: orderId }, "orderEditBegin");
  const id = begin.calculatedOrder.id;
  const added = await run(graphql, "add", ADD, { id, variantId, quantity }, "orderEditAddVariant");
  const item = added.calculatedLineItem;
  if (replaceCalc) await run(graphql, "remove", REMOVE, { id, lineItemId: replaceCalc, quantity: 0 }, "orderEditSetQuantity");
  await run(graphql, "commit", COMMIT, { id, notifyCustomer: false, staffNote: note }, "orderEditCommit");
  const to = lineText({ title: item.title, variantTitle: item.variantTitle, quantity: item.quantity, totalMinor: toMinor(item.originalUnitPriceSet.shopMoney.amount) * item.quantity });
  return { from, to };
}
