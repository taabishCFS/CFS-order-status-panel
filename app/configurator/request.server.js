// Reads and checks the JSON a browser sends to change or price a configured line.
// Returns { value } or { error }. Only shapes are checked here; the configurator's quote engine
// decides whether a selection is valid.
const ORDER_ID = /^\d{1,20}$/;
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const CHOICE_ID = /^[\w-]{1,64}$/;
const MAX_CHOICES = 60;

export function readChange(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const { orderId, lineItemId, choiceIds, quantities = {}, expectedVersion, reason } = body;

  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) return { error: "bad_request" };
  if (typeof lineItemId !== "string" || !LINE_ID.test(lineItemId)) return { error: "bad_request" };
  if (!Array.isArray(choiceIds) || choiceIds.length > MAX_CHOICES) return { error: "bad_request" };
  if (!choiceIds.every((id) => typeof id === "string" && CHOICE_ID.test(id))) return { error: "bad_request" };
  if (new Set(choiceIds).size !== choiceIds.length) return { error: "bad_request" };
  if (!quantities || typeof quantities !== "object" || Array.isArray(quantities)) return { error: "bad_request" };
  for (const [id, count] of Object.entries(quantities)) {
    if (!CHOICE_ID.test(id) || !Number.isInteger(count) || count < 1 || count > 999) return { error: "bad_request" };
  }

  return {
    value: {
      orderId: `gid://shopify/Order/${orderId}`,
      lineItemId,
      choiceIds,
      quantities,
      expectedVersion: Number.isInteger(expectedVersion) ? expectedVersion : null,
      reason: typeof reason === "string" ? reason.slice(0, 500) : "",
    },
  };
}

/** HTTP status for an apply or preview outcome. */
export const statusFor = (outcome) =>
  ({ applied: 200, unchanged: 200, stale: 409, not_editable: 409, invalid: 422, failed: 502 })[outcome] ?? 500;
