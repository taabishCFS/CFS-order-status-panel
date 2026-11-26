// Reads and changes the service charges on a Shopify order. A service is a custom line whose title carries its marker;
// changes go through one order edit, committed without telling the customer. VAT is included in the amount entered.
import { BEGIN, COMMIT, OrderEditError, run } from "./order-edit.server.js";
import { RESCHEDULE_TITLE, serviceTitle } from "./services.js";

const READ = `#graphql
  query CfsServices($id: ID!) {
    order(id: $id) {
      currencyCode
      lineItems(first: 250) { nodes { id title currentQuantity originalUnitPriceSet { shopMoney { amount currencyCode } } } }
    }
  }`;
const REMOVE = `#graphql
  mutation CfsServiceRemove($id: ID!, $lineItemId: ID!, $quantity: Int!) {
    orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) { calculatedLineItem { id } userErrors { field message } }
  }`;
const ADD = `#graphql
  mutation CfsServiceAdd($id: ID!, $title: String!, $price: MoneyInput!, $quantity: Int!, $taxable: Boolean, $requiresShipping: Boolean) {
    orderEditAddCustomItem(id: $id, title: $title, price: $price, quantity: $quantity, taxable: $taxable, requiresShipping: $requiresShipping) { calculatedLineItem { id } userErrors { field message } }
  }`;

const MARKER = /\[svc:([a-z_]+)\]/;
const numericId = (gid) => String(gid).split("/").at(-1);
const toMinor = (amount) => Math.round(Number(amount) * 100);

/** { currency, services: { [key]: { lineItemId, amountMinor } } } for the service lines still on the order. Throws if Shopify cannot be read. */
export async function readServices(graphql, orderId) {
  const json = await (await graphql(READ, { variables: { id: orderId } })).json();
  if (json.errors?.length) throw new OrderEditError(json.errors[0].message ?? "Shopify error", "read");
  const order = json.data?.order;
  if (!order) throw new OrderEditError("Order not found", "read");
  const services = {};
  for (const node of order.lineItems.nodes) {
    const key = MARKER.exec(node.title ?? "")?.[1];
    if (!key || node.currentQuantity < 1) continue;
    services[key] = { lineItemId: node.id, amountMinor: toMinor(node.originalUnitPriceSet.shopMoney.amount) };
  }
  return { currency: order.currencyCode, services };
}

/** plan: { add: [{ key, amountMinor }], remove: [{ key, lineItemId }] }. Returns { changed }. Throws OrderEditError; nothing is committed unless every step worked. */
export async function applyServices(graphql, { orderId, currency, plan, note }) {
  if (plan.add.length === 0 && plan.remove.length === 0) return { changed: false };
  const begin = await run(graphql, "begin", BEGIN, { id: orderId }, "orderEditBegin");
  const id = begin.calculatedOrder.id;

  for (const r of plan.remove) {
    await run(graphql, "remove", REMOVE, { id, lineItemId: `gid://shopify/CalculatedLineItem/${numericId(r.lineItemId)}`, quantity: 0 }, "orderEditSetQuantity");
  }
  for (const a of plan.add) {
    const price = { amount: (a.amountMinor / 100).toFixed(2), currencyCode: currency };
    await run(graphql, "add", ADD, { id, title: serviceTitle(a.key), price, quantity: 1, taxable: true, requiresShipping: false }, "orderEditAddCustomItem");
  }
  await run(graphql, "commit", COMMIT, { id, notifyCustomer: false, staffNote: note }, "orderEditCommit");
  return { changed: true };
}

/** Puts the reschedule charge the customer agreed to on the order (one custom line, VAT included), without telling the customer. Throws OrderEditError. */
export async function addRescheduleCharge(graphql, { orderId, amountMinor, note }) {
  const { currency } = await readServices(graphql, orderId);
  const begin = await run(graphql, "begin", BEGIN, { id: orderId }, "orderEditBegin");
  const id = begin.calculatedOrder.id;
  const price = { amount: (amountMinor / 100).toFixed(2), currencyCode: currency };
  await run(graphql, "add", ADD, { id, title: RESCHEDULE_TITLE, price, quantity: 1, taxable: true, requiresShipping: false }, "orderEditAddCustomItem");
  await run(graphql, "commit", COMMIT, { id, notifyCustomer: false, staffNote: note }, "orderEditCommit");
}
