import { buildChaseWhere } from "./supplier-chase-rules.js";

/** The live numbers on the Dashboard tiles. Cheap counts only. */
export async function dashboardCounts(db, shop, now = new Date()) {
  const [inProgress, lapsed, chaseup, refunds, sbts, freeStock] = await Promise.all([
    db.orderLine.count({ where: { shop, orderArchived: false, lineStatusId: 3 } }),
    db.orderLine.count({ where: buildChaseWhere(shop, { kind: "lapsed", brand: "", from: null, to: null }, now) }),
    db.orderLine.count({ where: buildChaseWhere(shop, { kind: "chaseup", brand: "", from: null, to: null }, now) }),
    db.refundRequest.count({ where: { shop, status: "requested", removedAt: null } }),
    db.freeStock.count({ where: { shop, itemType: { not: "freeStock" }, isCollected: false, qty: { gt: 0 } } }),
    db.freeStock.count({ where: { shop, itemType: "freeStock", qty: { gt: 0 } } }),
  ]);
  return { inProgress, lapsed, chaseup, refunds, sbts, freeStock };
}
