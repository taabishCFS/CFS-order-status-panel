// Giving free stock to an order line, and taking it back. Only this file changes FreeStock.qty for an order.
// Like the legacy system: matched by product code (the line's SKU), the line's status is not changed.
import { warehouseCodeOf } from "./free-stock-rules.js";

const money = (minor) => (minor == null ? "" : (minor / 100).toFixed(2));

const shapeAllocation = (a, stock) => ({
  id: a.id,
  lineId: a.lineId,
  qty: a.qty,
  unitCost: money(a.unitCostMinor),
  addedByName: a.addedByName ?? null,
  createdAt: a.createdAt.toISOString(),
  brand: stock?.brand ?? "",
  productName: stock?.productName ?? "",
  productCode: stock?.productCode ?? "",
  warehouseCode: stock ? warehouseCodeOf(stock) : "",
});

const shapeOption = (r) => ({ id: r.id, brand: r.brand, productName: r.productName, productCode: r.productCode, warehouseCode: warehouseCodeOf(r), qty: r.qty, cost: money(r.costMinor) });

const sameCode = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * For one order: what has been given to each line, and the free stock each line could be given.
 * Returns { allocations: [...], options: { [lineId]: [stock with qty left and the line's SKU as its product code] } }.
 */
export async function getOrderStock(db, shop, orderId) {
  const [lines, allocations] = await Promise.all([
    db.orderLine.findMany({ where: { shop, orderId, quantity: { gt: 0 } }, select: { lineId: true, sku: true } }),
    db.freeStockAllocation.findMany({ where: { shop, orderId }, include: { freeStock: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const skus = [...new Set(lines.map((l) => (l.sku ?? "").trim()).filter(Boolean))];
  const stock = skus.length
    ? await db.freeStock.findMany({ where: { shop, qty: { gt: 0 }, OR: skus.map((sku) => ({ productCode: { equals: sku, mode: "insensitive" } })) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    : [];
  const options = {};
  for (const line of lines) {
    const matches = stock.filter((s) => sameCode(s.productCode, line.sku)).map(shapeOption);
    if (matches.length) options[line.lineId] = matches;
  }
  return { allocations: allocations.map((a) => shapeAllocation(a, a.freeStock)), options };
}

/**
 * Give `qty` of a stock item to an order line. Returns { ok: true } or { ok: false, error }:
 * "bad_request" (not a whole number from 1), "no_line", "no_stock", "no_match" (the stock's product code is not the line's SKU),
 * "not_enough" (less than that left in stock), "too_many_for_line" (more than the line ordered, counting what it already has).
 * The quantity left is checked and lowered in the same step, so two people cannot take the same stock.
 */
export async function allocateStock(db, { shop, orderId, lineId, freeStockId, qty, actor }) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return { ok: false, error: "bad_request" };
  const [line, order] = await Promise.all([
    db.orderLine.findFirst({ where: { shop, orderId, lineId } }),
    db.order.findFirst({ where: { shop, orderId }, select: { name: true } }),
  ]);
  if (!line || !order) return { ok: false, error: "no_line" };

  return db.$transaction(async (tx) => {
    const stock = await tx.freeStock.findFirst({ where: { id: freeStockId, shop } });
    if (!stock) return { ok: false, error: "no_stock" };
    if (!sameCode(stock.productCode, line.sku)) return { ok: false, error: "no_match" };
    const given = await tx.freeStockAllocation.findMany({ where: { shop, lineId }, select: { qty: true } });
    if (given.reduce((sum, a) => sum + a.qty, 0) + qty > line.quantity) return { ok: false, error: "too_many_for_line" };
    const taken = await tx.freeStock.updateMany({ where: { id: stock.id, shop, qty: { gte: qty } }, data: { qty: { decrement: qty } } });
    if (taken.count === 0) return { ok: false, error: "not_enough" };
    await tx.freeStockAllocation.create({
      data: { shop, freeStockId: stock.id, orderId, orderName: order.name, lineId, qty, unitCostMinor: stock.costMinor, addedById: actor?.id ?? null, addedByName: actor?.name ?? null },
    });
    return { ok: true };
  });
}

/** Take an allocation back: the quantity returns to the stock item. Returns { ok: true } or { ok: false, error: "not_found" }. */
export async function removeAllocation(db, { shop, orderId, allocationId }) {
  if (typeof allocationId !== "string" || !allocationId) return { ok: false, error: "not_found" };
  return db.$transaction(async (tx) => {
    const found = await tx.freeStockAllocation.findFirst({ where: { id: allocationId, shop, orderId } });
    if (!found) return { ok: false, error: "not_found" };
    const gone = await tx.freeStockAllocation.deleteMany({ where: { id: found.id } });
    if (gone.count === 0) return { ok: false, error: "not_found" };
    await tx.freeStock.update({ where: { id: found.freeStockId }, data: { qty: { increment: found.qty } } });
    return { ok: true };
  });
}

/** Orders each stock item was given to, for the Stock page: { [freeStockId]: ["#1038 x1", ...] }. */
export async function allocationsByStock(db, shop, freeStockIds) {
  if (freeStockIds.length === 0) return {};
  const rows = await db.freeStockAllocation.findMany({ where: { shop, freeStockId: { in: freeStockIds } }, orderBy: { createdAt: "asc" } });
  const byStock = {};
  for (const r of rows) (byStock[r.freeStockId] ??= []).push(`${r.orderName} x${r.qty}`);
  return byStock;
}
