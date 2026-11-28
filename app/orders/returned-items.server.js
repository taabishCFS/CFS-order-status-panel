// Returned Items (legacy "ReturnedItems"): every cancelled line, its cancel reason, and what was done with the goods once back.
export const PAGE_SIZE = 50;
export const CANCELLED = 7;
// The old page's "Return Action" choices, in its order; the value is what the old system stored.
export const RETURN_ACTIONS = [
  { value: "ReturnBackToSupplier", label: "Return Back To Supplier" },
  { value: "DamageReturn", label: "Damage Return" },
  { value: "Clearance", label: "Clearance" },
  { value: "Dispose", label: "Dispose" },
  { value: "FreeStock", label: "Free Stock" },
];
const ACTION_VALUES = RETURN_ACTIONS.map((a) => a.value);
const LINE = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
export const MAX_MARK = 500;

/** Reads ?page=&q= (q is an order number to search for). */
export function parseReturnedParams(searchParams) {
  const page = Number(searchParams.get("page"));
  return {
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1,
    q: (searchParams.get("q") ?? "").trim().replace(/^#/, "").slice(0, 50),
  };
}

/** { rows, total, page, pageCount, size } newest order first. */
export async function listReturnedItems(db, shop, { page = 1, q = "" } = {}) {
  const where = { shop, lineStatusId: CANCELLED };
  if (q) {
    const orders = await db.order.findMany({ where: { shop, name: { contains: q, mode: "insensitive" } }, select: { orderId: true } });
    where.orderId = { in: orders.map((o) => o.orderId) };
  }
  const total = await db.orderLine.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const lines = await db.orderLine.findMany({ where, orderBy: [{ orderCreatedAt: "desc" }, { lineId: "asc" }], skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const [orders, actions] = lines.length
    ? await Promise.all([
        db.order.findMany({ where: { shop, orderId: { in: orderIds } }, select: { orderId: true, name: true } }),
        db.lineReturnAction.findMany({ where: { shop, lineId: { in: lines.map((l) => l.lineId) } } }),
      ])
    : [[], []];
  const names = new Map(orders.map((o) => [o.orderId, o.name]));
  const actionOf = new Map(actions.map((a) => [a.lineId, a]));
  const rows = lines.map((l) => {
    const a = actionOf.get(l.lineId);
    return {
      lineId: l.lineId, orderId: l.orderId, orderName: names.get(l.orderId) ?? "", orderDate: l.orderCreatedAt,
      product: l.title, variantTitle: l.variantTitle ?? null, sku: l.sku ?? "", quantity: l.quantity, brand: l.vendor ?? "",
      reason: l.cancelReason ?? "", statusId: l.lineStatusId,
      action: a?.action ?? null, actionLabel: RETURN_ACTIONS.find((x) => x.value === a?.action)?.label ?? "", actionBy: a?.byName ?? null, actionAt: a?.updatedAt ?? null,
    };
  });
  return { rows, total, page: current, pageCount, size: PAGE_SIZE };
}

/** Reads a mark request { lineIds, action }. Returns { value } or { error }. */
export function readMarkInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_request" };
  const { lineIds, action } = body;
  if (!ACTION_VALUES.includes(action)) return { error: "bad_action" };
  if (!Array.isArray(lineIds) || lineIds.length === 0 || lineIds.length > MAX_MARK || !lineIds.every((id) => typeof id === "string" && LINE.test(id))) return { error: "bad_request" };
  return { value: { lineIds: [...new Set(lineIds)], action } };
}

/** Records the return action on each ticked line that is still Cancelled. { ok, marked, skipped }. */
export async function markReturnAction(db, shop, { lineIds, action }, staff) {
  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds }, lineStatusId: CANCELLED }, select: { lineId: true, orderId: true } });
  for (const l of lines) {
    const data = { orderId: l.orderId, action, byName: staff.name };
    await db.lineReturnAction.upsert({ where: { shop_lineId: { shop, lineId: l.lineId } }, create: { shop, lineId: l.lineId, ...data }, update: data });
  }
  return { ok: true, marked: lines.length, skipped: lineIds.length - lines.length };
}
