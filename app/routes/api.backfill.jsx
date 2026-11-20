import { authenticate } from "../shopify.server";
import db from "../db.server";
import { backfillPage } from "../orders/backfill.server";

// POST { after } copies one page of existing orders into the mirror. A caller repeats with the returned endCursor.
export const action = async ({ request }) => {
  const { admin, session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return cors(new Response(null, { status: 405 }));
  const body = await request.json().catch(() => ({}));
  const after = typeof body?.after === "string" ? body.after : null;
  const page = await backfillPage({ db, graphql: admin.graphql, shop: session.shop, after });
  return cors(Response.json(page));
};
