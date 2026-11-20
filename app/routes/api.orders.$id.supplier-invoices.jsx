import db from "../db.server";
import { readInvoiceInput } from "../orders/supplier-invoice";
import { getSupplierInvoices, saveSupplierInvoice } from "../orders/supplier-invoice.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;

// GET: the supplier invoice details saved on this order's lines. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (!ID.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  return cors(Response.json({ invoices: await getSupplierInvoices(db, session.shop, `gid://shopify/Order/${params.id}`) }));
};

// POST { lineId, invoiceDate, invoiceNumber, amount, paid }: save one line's supplier invoice. Verified staff only.
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
  const read = readInvoiceInput(body);
  if (read.error) return json({ error: "bad_request" }, 400);

  const result = await saveSupplierInvoice(db, { shop: session.shop, orderId: `gid://shopify/Order/${params.id}`, input: read.value, actor: staff });
  if (!result.ok) return json({ error: result.code }, 404);
  return json({ ok: true, invoice: result.invoice });
};
