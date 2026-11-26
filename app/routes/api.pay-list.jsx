import db from "../db.server";
import { addToPayList, listPayList, readPayListInput, removeFromPayList } from "../orders/pay-list.server";
import { parsePayParams } from "../orders/pay-supplier.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?q=&page=&all=1: the signed-in staff member's Supplier Payments list. POST { op: "add" | "remove", lineIds }: change it.
// Verified staff only; changing needs the Pay suppliers permission. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const staff = staffFromSession(session);
  if (!staff) return cors(Response.json({ error: "staff_not_verified", message: "Supplier Payments is each person's own list, so it needs a verified Shopify staff sign-in." }, { status: 403 }));
  return cors(Response.json(await listPayList(db, admin.graphql, session.shop, staff, parsePayParams(new URL(request.url).searchParams))));
};

export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!(await can(db, session.shop, staff, "pay_suppliers"))) return json({ error: "no_permission", message: "You do not have permission to pay suppliers." }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readPayListInput(body);
  if (read.error) return json({ error: read.error }, 400);
  const { op, lineIds } = read.value;
  return json(op === "add" ? await addToPayList(db, session.shop, lineIds, staff) : await removeFromPayList(db, session.shop, lineIds, staff));
};
