import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Shopify can send this more than once, or after the sessions are already gone.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
