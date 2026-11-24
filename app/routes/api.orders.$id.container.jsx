import db from "../db.server";
import { allocateContainerStock, getOrderContainerStock, removeContainerAllocation } from "../orders/container-allocation.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;
const STATUS = { bad_request: 400, no_line: 404, no_stock: 404, not_found: 404, no_match: 409, not_enough: 409, too_many_for_line: 409 };

// GET: the container stock given to this order's lines, and the container stock each line could be given. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (!ID.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  return cors(Response.json(await getOrderContainerStock(db, session.shop, `gid://shopify/Order/${params.id}`)));
};

// POST { action: "allocate", lineId, stockId, qty } gives container stock to a line. POST { action: "remove", allocationId } takes it back. Verified staff only.
export const action = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!ID.test(params.id ?? "")) return json({ error: "bad_request" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const orderId = `gid://shopify/Order/${params.id}`;
  let result;
  if (body?.action === "allocate") {
    if (typeof body.lineId !== "string" || typeof body.stockId !== "string") return json({ error: "bad_request" }, 400);
    result = await allocateContainerStock(db, { shop: session.shop, orderId, lineId: body.lineId, containerStockId: body.stockId, qty: Number(body.qty), actor: staff });
  } else if (body?.action === "remove") {
    result = await removeContainerAllocation(db, { shop: session.shop, orderId, allocationId: body.allocationId });
  } else {
    return json({ error: "bad_request" }, 400);
  }
  return result.ok ? json({ ok: true }) : json({ error: result.error }, STATUS[result.error] ?? 400);
};
