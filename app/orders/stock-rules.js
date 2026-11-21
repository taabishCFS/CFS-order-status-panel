// The out-of-stock tint on a line in Orders by Brand. A product is out of stock when its "In/Out Stock Status"
// field says OUT OF STOCK, or when its tracked inventory is zero or less. Yellow means a due date is set, red means none.
const OUT = "OUT OF STOCK";

/** { tint: "yellow" | "red" | null, dueDate: "YYYY-MM-DD" | null }. The due date is only returned for a tinted line. */
export function stockTint({ status = null, inventory = null, tracked = false, dueDate = null } = {}) {
  const flagged = typeof status === "string" && status.trim().toUpperCase() === OUT;
  const empty = tracked === true && typeof inventory === "number" && inventory <= 0;
  if (!flagged && !empty) return { tint: null, dueDate: null };
  return dueDate ? { tint: "yellow", dueDate } : { tint: "red", dueDate: null };
}

/** Adds stockTint and stockDueDate to each row, from a Map of variant id -> stock state (null when it could not be read). */
export function withStock(rows, stockByVariant) {
  return rows.map((row) => {
    const stock = row.variantId ? stockByVariant?.get(row.variantId) : undefined;
    const { tint, dueDate } = stock ? stockTint(stock) : { tint: null, dueDate: null };
    return { ...row, stockTint: tint, stockDueDate: dueDate };
  });
}
