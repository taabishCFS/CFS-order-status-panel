import { authenticate } from "../shopify.server";
import db from "../db.server";
import { processOrderWebhook } from "../orders/webhook.server";

// orders/create, orders/updated, orders/cancelled and refunds/create all land here.
// authenticate.webhook refuses any request without Shopify's signature.
export const action = async ({ request }) => {
  const { shop, topic, admin, payload } = await authenticate.webhook(request);
  const { status } = await processOrderWebhook({ db, graphql: admin?.graphql, shop, topic, payload });
  return new Response(null, { status });
};
