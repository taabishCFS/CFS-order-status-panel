import { readContactInput } from "../orders/order-contact";
import { updateOrderContact } from "../orders/order-contact.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// This loader also answers the browser's OPTIONS preflight before the extension's POST.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// POST { email?, phone?, shippingAddress? }: change the order's contact details in Shopify. Verified staff only.
// The history entry is written by the extension afterwards, as for a configuration change.
export const action = async ({ request, params }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!staffFromSession(session)) return json({ error: "staff_not_verified" }, 403);
  if (!/^\d{1,20}$/.test(params.id ?? "")) return json({ error: "bad_request" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readContactInput(body);
  if (read.error) return json({ error: read.error }, 400);

  const result = await updateOrderContact(admin.graphql, `gid://shopify/Order/${params.id}`, read.value);
  if (!result.ok) return json({ error: "shopify_rejected", message: result.message }, 422);
  return json({ ok: true });
};
