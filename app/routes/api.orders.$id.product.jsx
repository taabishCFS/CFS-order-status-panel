import { readProductInput } from "../orders/product-change";
import { changeProduct, searchVariants } from "../orders/product-change.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;

// GET ?q=text: products (variants) matching the text, for the Add New Product picker. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { admin, cors } = await authenticate.admin(request);
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return cors(Response.json({ products: await searchVariants(admin.graphql, q) }));
  } catch (error) {
    console.error("Product search failed", error?.message ?? error);
    return cors(Response.json({ error: "shopify_unavailable" }, { status: 502 }));
  }
};

// POST { variantId, quantity, replaceLineItemId? }: add the product to the order (or swap it for a line) in one order edit.
// Shopify works out the new total and balance. Verified staff only. Returns the text for the history.
export const action = async ({ request, params }) => {
  const { session, admin, cors } = await authenticate.admin(request);
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
  const read = readProductInput(body);
  if (read.error) return json({ error: read.error }, 400);

  try {
    const { from, to } = await changeProduct(admin.graphql, {
      orderId: `gid://shopify/Order/${params.id}`,
      ...read.value,
      note: `${read.value.replaceLineItemId ? "Product replaced" : "Product added"} by ${staff.name}`,
    });
    return json({ ok: true, from, to });
  } catch (error) {
    console.error(`Product change ${params.id} failed at ${error?.stage ?? "?"}`, error?.message ?? error);
    return json({ error: "shopify_rejected", message: error?.message ?? "Shopify refused the change" }, 422);
  }
};
