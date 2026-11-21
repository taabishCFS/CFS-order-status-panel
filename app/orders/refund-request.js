// Pure rules for refund requests: staff ask for a refund on an order, and a list collects them. Nothing here moves money.
import REASONS from "../../extensions/cfs-orders-dashboard/src/refundReasons.json";

const REASON_CODES = new Set(REASONS.map((r) => r.code));
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const bad = (error) => ({ error });

/** Reads the JSON a browser sends. Returns { value } (amountMinor is null for a full refund with no amount) or { error }. */
export function readRefundInput(body) {
  if (!body || typeof body !== "object") return bad("bad_request");
  const { clientKey, reason, type, amount, lineIds = [], notes = "" } = body;

  if (typeof clientKey !== "string" || clientKey.length < 1 || clientKey.length > 80) return bad("bad_request");
  if (!REASON_CODES.has(reason)) return bad("bad_reason");
  if (type !== "part" && type !== "full") return bad("bad_type");
  if (!Array.isArray(lineIds) || lineIds.length > 250 || !lineIds.every((id) => typeof id === "string" && LINE_ID.test(id))) return bad("bad_request");
  if (typeof notes !== "string" || notes.length > 1000) return bad("bad_request");

  const cleaned = (typeof amount === "string" || typeof amount === "number" ? String(amount) : "").replace(/[£,\s]/g, "");
  let amountMinor = null;
  if (cleaned !== "") {
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return bad("bad_amount");
    amountMinor = Math.round(Number(cleaned) * 100);
    if (amountMinor <= 0) return bad("bad_amount");
  } else if (type === "part") {
    return bad("bad_amount");
  }

  return { value: { clientKey, reason, type, amountMinor, lineIds, notes: notes.trim() } };
}

/** What can still be asked for: the order total less what Shopify already refunded and what is already requested. */
export const refundableMinor = (order, requestedMinor) => Math.max(0, order.totalMinor - order.refundedMinor - requestedMinor);
