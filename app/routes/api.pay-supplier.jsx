import db from "../db.server";
import { listPayable, parsePayParams, readPayInput, saveCost, saveInvoiceNumber, setPaid } from "../orders/pay-supplier.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?paid=1&brand=&q=&page=&all=1: the Pay To Supplier (unpaid) or Supplier Paid (paid=1) list, with Shopify costs. Read only.
// POST { op: "manual" | "dhd", lineId, value } | { op: "invoice", lineId, value } | { op: "paid", lineIds, paid }: change a line. Verified staff with the Pay suppliers permission.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  return cors(Response.json(await listPayable(db, admin.graphql, session.shop, parsePayParams(new URL(request.url).searchParams))));
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
  const read = readPayInput(body);
  if (read.error) return json({ error: read.error }, 400);
  const v = read.value;
  if (v.op === "paid") return json(await setPaid(db, session.shop, v.lineIds, v.paid, staff));
  const done = v.op === "invoice" ? await saveInvoiceNumber(db, session.shop, v, staff) : await saveCost(db, session.shop, v, staff);
  return done.ok ? json({ ok: true }) : json({ error: done.code }, 404);
};
