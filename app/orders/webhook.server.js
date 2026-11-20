// What an order webhook does: re-read the order from Shopify and save it. Repeats and out-of-order deliveries are safe.
import { fetchOrder } from "./fetch-order.server.js";
import { mapOrder } from "./map-order.js";
import { upsertOrder } from "./mirror.server.js";

// Order webhooks name the order by its gid; a refund names it by its numeric order_id.
function orderIdOf(payload) {
  const gid = payload?.admin_graphql_api_id;
  if (typeof gid === "string" && gid.startsWith("gid://shopify/Order/")) return gid;
  return payload?.order_id ? `gid://shopify/Order/${payload.order_id}` : null;
}

/** Returns { status, outcome }. 500 means "send it again"; every other case is a 200 so Shopify stops retrying. */
export async function processOrderWebhook({ db, graphql, shop, topic, payload }) {
  if (!graphql) {
    console.error(`Webhook ${topic} for ${shop}: no stored access (app uninstalled?)`);
    return { status: 200, outcome: "no_access" };
  }
  const orderId = orderIdOf(payload);
  if (!orderId) {
    console.error(`Webhook ${topic} for ${shop}: payload names no order`);
    return { status: 200, outcome: "no_order_id" };
  }
  try {
    const order = await fetchOrder(graphql, orderId);
    if (!order) return { status: 200, outcome: "order_not_found" };
    const { outcome } = await upsertOrder(db, mapOrder(shop, order));
    console.log(`Webhook ${topic} for ${shop}: ${orderId} ${outcome}`);
    return { status: 200, outcome };
  } catch (error) {
    console.error(`Webhook ${topic} for ${shop}: ${orderId} not saved`, error?.message);
    return { status: 500, outcome: "error" };
  }
}
