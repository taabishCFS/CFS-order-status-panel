import db from "../db.server";
import { deliveryNoteAllowed } from "../orders/documents";
import { loadDocument, logDeliveryNote } from "../orders/documents.server";
import { signExportLink } from "../orders/export-link.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const MAX_ORDERS = 50;
const LINE = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const ORDER = /^gid:\/\/shopify\/Order\/(\d{1,20})$/;

// POST { lineIds }: delivery notes for the orders of the ticked lines, one sheet per order, in one printable page.
// Orders the rules refuse (balance owed, 50% or 75% refund, nothing printable) are skipped and named in the answer; each note printed is logged.
// Answers { url, printed, skipped: [{ order, reason }] }. Verified staff with the Print delivery notes permission.
// This action also answers the browser's OPTIONS preflight through the loader.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

export const action = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!(await can(db, session.shop, staff, "delivery_notes"))) return json({ error: "no_permission", message: "You do not have permission to print delivery notes." }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const lineIds = Array.isArray(body?.lineIds) ? [...new Set(body.lineIds.filter((l) => typeof l === "string" && LINE.test(l)))].slice(0, 500) : [];
  if (lineIds.length === 0) return json({ error: "nothing_selected" }, 400);

  const lines = await db.orderLine.findMany({ where: { shop: session.shop, lineId: { in: lineIds } }, select: { orderId: true } });
  const orderIds = [...new Set(lines.map((l) => l.orderId))].filter((id) => ORDER.test(id));
  if (orderIds.length === 0) return json({ error: "nothing_selected" }, 400);
  if (orderIds.length > MAX_ORDERS) return json({ error: "too_many", message: `Select at most ${MAX_ORDERS} orders at a time (you picked ${orderIds.length}).` }, 422);

  const printable = [];
  const skipped = [];
  try {
    for (const orderId of orderIds) {
      const found = await loadDocument(admin.graphql, db, { shop: session.shop, orderId });
      if (!found) { skipped.push({ order: ORDER.exec(orderId)[1], reason: "Order not found." }); continue; }
      const allowed = deliveryNoteAllowed(found.doc);
      if (!allowed.ok) { skipped.push({ order: found.doc.name, reason: allowed.reason }); continue; }
      printable.push({ orderId, number: ORDER.exec(orderId)[1] });
    }
  } catch (error) {
    console.error("Delivery notes failed", error?.message ?? error);
    return json({ error: "shopify_unavailable", message: "Shopify could not be read just now. Try again shortly." }, 502);
  }
  if (printable.length === 0) return json({ error: "none_allowed", message: "No delivery note can be printed for the selected orders.", skipped }, 422);

  for (const p of printable) await logDeliveryNote(db, { shop: session.shop, orderId: p.orderId, staff });
  const query = new URLSearchParams({ orders: printable.map((p) => p.number).join(",") });
  const token = signExportLink({ shop: session.shop, kind: "doc-delivery-notes", query: query.toString() }, process.env.SHOPIFY_API_SECRET);
  const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return json({ url: `${base}/exports/document?t=${encodeURIComponent(token)}`, printed: printable.length, skipped });
};
