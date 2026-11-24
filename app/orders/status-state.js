// Reads the saved status record (the `$app:cfs_status` order metafield) into the few fields the order lists need.
// A bad or missing record never throws: lines simply have no status.
const empty = (unreadable) => ({ orderStatusId: null, lines: {}, unreadable });
const int = (v) => (Number.isInteger(v) ? v : null);
const text = (v) => (typeof v === "string" ? v : null);
const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const isoDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function readStatusState(value) {
  if (value == null) return empty(false);
  let state;
  try {
    state = JSON.parse(value);
  } catch {
    return empty(true);
  }
  if (!isObject(state) || !isObject(state.lines)) return empty(true);
  const lines = {};
  // A line can have an expected date or a delivery answer without ever having had a status, so read every line named anywhere.
  const ids = new Set([
    ...Object.keys(state.lines),
    ...Object.keys(isObject(state.expected) ? state.expected : {}),
    ...Object.keys(isObject(state.delivery) ? state.delivery : {}),
    ...Object.keys(isObject(state.supplierDelivered) ? state.supplierDelivered : {}),
  ]);
  for (const id of ids) {
    const stamp = state.lines[id];
    const delivery = state.delivery?.[id]?.outcome;
    lines[id] = {
      statusId: int(stamp?.statusId),
      expectedDate: text(state.expected?.[id]?.date),
      delivery: delivery === "confirmed" || delivery === "declined" ? delivery : null,
      stockedDate: isoDay(state.supplierDelivered?.[id]?.date),
    };
  }
  return { orderStatusId: int(state.order?.statusId), lines, unreadable: false };
}
