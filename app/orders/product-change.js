// Add New Product: the request a staff member sends to add a product to an order, or swap it for an existing line.
const VARIANT = /^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/;
const LINE = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
export const MAX_QTY = 24; // the legacy Qty list stops at 24

/** body: { variantId, quantity, replaceLineItemId? } -> { value } or { error }. */
export function readProductInput(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  if (typeof body.variantId !== "string" || !VARIANT.test(body.variantId)) return { error: "bad_product" };
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) return { error: "bad_quantity" };
  const replace = body.replaceLineItemId;
  if (replace !== undefined && replace !== null && replace !== "" && (typeof replace !== "string" || !LINE.test(replace))) return { error: "bad_line" };
  return { value: { variantId: body.variantId, quantity, replaceLineItemId: replace || null } };
}

const pounds = (minor) => `£${(minor / 100).toFixed(2)}`;

/** "Oslo Sideboard (Oak) x 2 = £239.98" for the history. */
export const lineText = ({ title, variantTitle, quantity, totalMinor }) =>
  `${title}${variantTitle && variantTitle !== "Default Title" ? ` (${variantTitle})` : ""} x ${quantity} = ${pounds(totalMinor)}`;
