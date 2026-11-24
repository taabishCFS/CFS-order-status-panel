import db from "../db.server";
import { KINDS, RETURN_TYPES, deliveryNoteAllowed } from "../orders/documents";
import { deliveryNoteLog, loadDocument, logDeliveryNote } from "../orders/documents.server";
import { signExportLink } from "../orders/export-link.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;
const LINE = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;

// GET ?log=1: the delivery notes log. GET ?kind=<document>[&lineIds=a,b&type=Free_Stock]: a signed five-minute link to the
// printable page (/exports/document). The delivery note is refused when the rules say so, and each one opened is logged.
// Verified staff only. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request, params }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!ID.test(params.id ?? "")) return json({ error: "bad_request" }, 400);
  const orderId = `gid://shopify/Order/${params.id}`;
  const search = new URL(request.url).searchParams;

  try {
    if (search.get("log")) return json({ log: await deliveryNoteLog(db, { shop: session.shop, orderId }) });

    const kind = search.get("kind");
    if (!KINDS.includes(kind)) return json({ error: "bad_request" }, 400);
    const query = new URLSearchParams({ order: params.id });

    if (kind === "return-label") {
      const lineIds = (search.get("lineIds") ?? "").split(",").filter(Boolean);
      const type = search.get("type") ?? "";
      if (lineIds.length < 1 || !lineIds.every((l) => LINE.test(l))) return json({ error: "no_lines" }, 400);
      if (!RETURN_TYPES[type]) return json({ error: "bad_type" }, 400);
      query.set("lineIds", lineIds.join(","));
      query.set("type", type);
    }
    if (kind === "delivery-note") {
      if (!(await can(db, session.shop, staff, "delivery_notes"))) return json({ error: "no_permission", message: "You do not have permission to print delivery notes." }, 403);
      const found = await loadDocument(admin.graphql, db, { shop: session.shop, orderId });
      if (!found) return json({ error: "not_found" }, 404);
      const allowed = deliveryNoteAllowed(found.doc);
      if (!allowed.ok) return json({ error: "not_allowed", message: allowed.reason }, 422);
      await logDeliveryNote(db, { shop: session.shop, orderId, staff });
    }

    const token = signExportLink({ shop: session.shop, kind: `doc-${kind}`, query: query.toString() }, process.env.SHOPIFY_API_SECRET);
    const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
    return json({ url: `${base}/exports/document?t=${encodeURIComponent(token)}` });
  } catch (error) {
    console.error(`Document ${params.id} failed`, error?.message ?? error);
    return json({ error: "shopify_unavailable" }, 502);
  }
};
