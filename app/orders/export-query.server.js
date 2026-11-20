// Builds the Orders by Brand CSV exports: reads the matching lines, looks up cost and collection in Shopify (Export 3 only).
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { EXPORT_HEADERS, buildCsv, exportRow } from "./export-rules.js";
import { MAX_ALL_LINES, buildLineWhere } from "./list-rules.js";

const BATCH = 100;
const COST_QUERY = `#graphql
  query CfsExportCosts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem { unitCost { amount } }
        product { collections(first: 10) { nodes { title } } }
      }
    }
  }`;

const statusLabels = new Map(statuses.map((s) => [s.id, s.label]));

/** Map of variant id -> { costMinor: number | null, range: string }. Throws when Shopify reports an error. */
export async function lookupCosts(graphql, variantIds) {
  const found = new Map();
  const ids = [...new Set(variantIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += BATCH) {
    const body = await (await graphql(COST_QUERY, { variables: { ids: ids.slice(i, i + BATCH) } })).json();
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
    for (const n of body.data.nodes) {
      if (!n?.id) continue;
      const amount = n.inventoryItem?.unitCost?.amount;
      found.set(n.id, {
        costMinor: amount == null ? null : Math.round(Number(amount) * 100),
        range: (n.product?.collections?.nodes ?? []).map((c) => c.title).join(" / "),
      });
    }
  }
  return found;
}

/**
 * { csv, count, capped, costLookup }. kind 2 = supplier chase-up sheet, 3 = per-brand ordering sheet.
 * costLookup is "ok", "unavailable" (Shopify could not be read, so cost and range are blank) or "not_needed".
 */
export async function buildExport({ db, graphql, shop, params, kind }) {
  const found = await db.orderLine.findMany({ where: buildLineWhere(shop, params), orderBy: [{ orderCreatedAt: "desc" }, { lineId: "asc" }], take: MAX_ALL_LINES + 1 });
  const capped = found.length > MAX_ALL_LINES;
  const lines = capped ? found.slice(0, MAX_ALL_LINES) : found;

  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const orders = orderIds.length ? await db.order.findMany({ where: { shop, orderId: { in: orderIds } }, select: { orderId: true, name: true } }) : [];
  const names = new Map(orders.map((o) => [o.orderId, o.name]));

  let costs = new Map();
  let costLookup = "not_needed";
  if (kind === 3 && lines.length) {
    try {
      costs = await lookupCosts(graphql, lines.map((l) => l.variantId));
      costLookup = "ok";
    } catch (error) {
      console.error("Export: cost lookup failed", error.message);
      costLookup = "unavailable";
    }
  }

  const rows = lines.map((l) => exportRow(kind, l, { orderName: names.get(l.orderId) ?? "", statusLabel: l.lineStatusId == null ? null : statusLabels.get(l.lineStatusId) ?? null, cost: costs.get(l.variantId) ?? null }));
  return { csv: buildCsv(EXPORT_HEADERS[kind], rows), count: rows.length, capped, costLookup };
}
