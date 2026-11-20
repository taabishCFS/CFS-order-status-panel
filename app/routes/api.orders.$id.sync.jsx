import db from "../db.server";
import { fetchOrder } from "../orders/fetch-order.server";
import { mapOrder } from "../orders/map-order";
import { upsertOrder } from "../orders/mirror.server";
import { authenticate } from "../shopify.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// This loader also answers the browser's OPTIONS preflight before the extension's POST.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return json(cors, { error: "method_not_allowed" }, 405);
};

// POST: re-read one order from Shopify and refresh its copy, so the lists show a status the moment staff save it.
export const action = async ({ request, params }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  if (!/^\d{1,20}$/.test(params.id ?? "")) return json(cors, { error: "bad_request" }, 400);

  try {
    const order = await fetchOrder(admin.graphql, `gid://shopify/Order/${params.id}`);
    if (!order) return json(cors, { error: "not_found" }, 404);
    const { outcome } = await upsertOrder(db, mapOrder(session.shop, order));
    return json(cors, { ok: true, outcome });
  } catch (error) {
    console.error(`Order sync ${params.id} failed`, error?.message ?? error);
    return json(cors, { error: "shopify_unavailable" }, 502);
  }
};
