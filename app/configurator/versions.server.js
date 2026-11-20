// Saved configuration versions of an order's configured lines.
// Version 1 is copied from the configurator the first time a line is read; later versions are staff changes.
import { ConfiguratorError } from "./client.server";

const summary = (row) => ({
  version: row.version,
  source: row.source,
  status: row.status,
  configuration: row.configuration,
  unitMinor: row.unitMinor,
  deltaMinor: row.deltaMinor,
  reason: row.reason ?? null,
  actorId: row.actorId ?? null,
  actorName: row.actorName ?? null,
  createdAt: row.createdAt,
});

/**
 * call({ shop, path }) asks the configurator (signed for the shop).
 * Returns { lines: [...] } or { lines: [], reason: "no_snapshot" }. Other configurator errors are thrown.
 */
export async function currentConfiguration(db, call, { shop, orderId }) {
  let order;
  try {
    order = await call({ shop, path: `/staff/order-lines?order=${orderId}` });
  } catch (error) {
    if (error instanceof ConfiguratorError && error.status === 404 && error.code === "no_snapshot") {
      return { lines: [], reason: "no_snapshot" };
    }
    throw error;
  }

  for (const line of order.lines) {
    if (!line.configuration) continue;
    await db.lineConfiguration.upsert({
      where: { shop_lineItemId_version: { shop, lineItemId: line.lineItemId, version: 1 } },
      create: {
        shop,
        orderId,
        lineItemId: line.lineItemId,
        version: 1,
        source: "original",
        configuration: line.configuration,
        unitMinor: line.unitCents,
        deltaMinor: 0,
        status: "applied",
      },
      update: {},
    });
  }

  const rows = await db.lineConfiguration.findMany({ where: { shop, orderId }, orderBy: { version: "asc" } });

  const lines = order.lines.map((line) => {
    const mine = rows.filter((r) => r.lineItemId === line.lineItemId);
    const current = mine.filter((r) => r.status === "applied").at(-1) ?? null;
    const pending = mine.some((r) => r.status === "pending");
    const base = {
      lineItemId: line.lineItemId,
      productId: line.productId,
      variantId: line.variantId,
      title: line.title,
      variantTitle: line.variantTitle,
      quantity: line.quantity,
      version: current?.version ?? null,
      configuration: current?.configuration ?? null,
      unitMinor: current?.unitMinor ?? line.unitCents,
      history: mine.map(summary),
    };
    if (line.editable && pending) return { ...base, editable: false, reason: "change_pending" };
    return line.editable ? { ...base, editable: true } : { ...base, editable: false, reason: line.reason };
  });
  return { lines };
}
