import db from "../db.server";
import { recordOpen } from "../orders/order-open.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// This loader also answers the browser's OPTIONS preflight before the extension's POST.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return json(cors, { error: "method_not_allowed" }, 405);
};

// POST: a verified staff member opened this order. Returns who opened it before them (or null) and records this open.
export const action = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json(cors, { error: "staff_not_verified" }, 403);
  if (!/^\d{1,20}$/.test(params.id ?? "")) return json(cors, { error: "bad_request" }, 400);
  try {
    const last = await recordOpen(db, { shop: session.shop, orderId: `gid://shopify/Order/${params.id}`, staff });
    return json(cors, { ok: true, last });
  } catch (error) {
    console.error(`Order open ${params.id} failed`, error?.message ?? error);
    return json(cors, { error: "unavailable" }, 500);
  }
};
