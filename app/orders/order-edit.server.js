// Posts a price difference onto a Shopify order with order edit, and reads back what is needed to
// check an edit is allowed. Shopify cannot change a configured line's options (see
// docs/phase4-spike-report.md), so the difference is carried as an extra item or a line discount.
//
// VAT is parked (see the Phase 4 design): the custom item is posted taxable: true as a placeholder.

export class OrderEditError extends Error {
  constructor(message, stage) {
    super(message);
    this.name = "OrderEditError";
    this.stage = stage;
  }
}

const numericId = (gid) => String(gid).split("/").at(-1);

/** A short tag put in the item title or discount description so a committed edit can be found again. */
export const markerFor = (lineItemId, version) => `[cfg:${numericId(lineItemId)}:v${version}]`;

const major = (minor) => (minor / 100).toFixed(2);

const BEGIN = `#graphql
  mutation orderEditBegin($id: ID!) {
    orderEditBegin(id: $id) { calculatedOrder { id } userErrors { field message } }
  }`;
const ADD_ITEM = `#graphql
  mutation orderEditAddCustomItem($id: ID!, $title: String!, $price: MoneyInput!, $quantity: Int!, $taxable: Boolean, $requiresShipping: Boolean) {
    orderEditAddCustomItem(id: $id, title: $title, price: $price, quantity: $quantity, taxable: $taxable, requiresShipping: $requiresShipping) {
      calculatedLineItem { id } userErrors { field message }
    }
  }`;
const ADD_DISCOUNT = `#graphql
  mutation orderEditAddLineItemDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
    orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
      addedDiscountStagedChange { id } userErrors { field message }
    }
  }`;
const COMMIT = `#graphql
  mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
    orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      order { id } userErrors { field message }
    }
  }`;
const FIND = `#graphql
  query orderMarkers($id: ID!) {
    order(id: $id) {
      lineItems(first: 250) {
        nodes {
          id title
          discountAllocations { discountApplication { ... on DiscountApplication { ... on ManualDiscountApplication { title description } } } }
        }
      }
    }
  }`;
const STATE = `#graphql
  query orderEditState($id: ID!) {
    order(id: $id) {
      currencyCode cancelledAt
      lineItems(first: 250) { nodes { id quantity unfulfilledQuantity } }
    }
  }`;

/** Runs one request; throws OrderEditError for a GraphQL error, a user error or a missing result. */
async function run(graphql, stage, query, variables, field) {
  const response = await graphql(query, { variables });
  const json = await response.json();
  if (json.errors?.length) throw new OrderEditError(json.errors[0].message ?? "Shopify error", stage);
  const result = json.data?.[field];
  if (!result) throw new OrderEditError("No result from Shopify", stage);
  if (result.userErrors?.length) throw new OrderEditError(result.userErrors[0].message, stage);
  return result;
}

/**
 * deltaMinor > 0 adds a custom item for that amount; < 0 discounts the original line by that amount in
 * total (the per-unit figure is the amount over lineQuantity).
 * Commits without notifying the customer. Returns { adjustment }. Throws OrderEditError, and
 * nothing is committed unless every earlier step succeeded.
 */
export async function editOrder(graphql, { orderId, lineItemId, lineQuantity, deltaMinor, currency, title, marker, note }) {
  if (!Number.isInteger(deltaMinor) || deltaMinor === 0) throw new OrderEditError("No price difference to post", "begin");
  const label = `${title} ${marker}`;
  const amount = { amount: major(Math.abs(deltaMinor)), currencyCode: currency };
  // Shopify applies a fixed line discount to EACH unit (checked live: 1.00 off a quantity-2 line took 2.00 off).
  if (deltaMinor < 0 && (!Number.isInteger(lineQuantity) || lineQuantity < 1 || Math.abs(deltaMinor) % lineQuantity !== 0)) {
    throw new OrderEditError("The difference does not divide evenly over the line quantity", "begin");
  }
  const perUnit = { amount: major(Math.abs(deltaMinor) / lineQuantity), currencyCode: currency };

  const begin = await run(graphql, "begin", BEGIN, { id: orderId }, "orderEditBegin");
  const calculatedOrderId = begin.calculatedOrder.id;

  if (deltaMinor > 0) {
    await run(
      graphql,
      "add",
      ADD_ITEM,
      { id: calculatedOrderId, title: label, price: amount, quantity: 1, taxable: true, requiresShipping: false },
      "orderEditAddCustomItem",
    );
  } else {
    await run(
      graphql,
      "add",
      ADD_DISCOUNT,
      {
        id: calculatedOrderId,
        lineItemId: `gid://shopify/CalculatedLineItem/${numericId(lineItemId)}`,
        discount: { description: label, fixedValue: perUnit },
      },
      "orderEditAddLineItemDiscount",
    );
  }

  await run(graphql, "commit", COMMIT, { id: calculatedOrderId, notifyCustomer: false, staffNote: `${note} ${marker}` }, "orderEditCommit");
  return { adjustment: { kind: deltaMinor > 0 ? "custom_item" : "discount", amountMinor: Math.abs(deltaMinor), currency } };
}

async function readOrder(graphql, stage, query, orderId) {
  const response = await graphql(query, { variables: { id: orderId } });
  const json = await response.json();
  if (json.errors?.length) throw new OrderEditError(json.errors[0].message ?? "Shopify error", stage);
  if (!json.data?.order) throw new OrderEditError("Order not found", stage);
  return json.data.order;
}

/** True when the order already carries an edit with this marker (an item title or discount description). */
export async function findEdit(graphql, { orderId, marker }) {
  const order = await readOrder(graphql, "find", FIND, orderId);
  return order.lineItems.nodes.some(
    (node) =>
      node.title?.includes(marker) ||
      node.discountAllocations?.some((a) => `${a.discountApplication?.title ?? ""} ${a.discountApplication?.description ?? ""}`.includes(marker)),
  );
}

/** { currency, cancelledAt, lines: { [lineItemId]: { quantity, unfulfilledQuantity } } } */
export async function loadOrderState(graphql, orderId) {
  const order = await readOrder(graphql, "state", STATE, orderId);
  return {
    currency: order.currencyCode,
    cancelledAt: order.cancelledAt ?? null,
    lines: Object.fromEntries(order.lineItems.nodes.map((n) => [n.id, { quantity: n.quantity, unfulfilledQuantity: n.unfulfilledQuantity }])),
  };
}
