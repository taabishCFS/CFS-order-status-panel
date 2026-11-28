// Paypal Orders (legacy PayPalExpressOrderSummary): the items of orders paid one way (PayPal by default) in a date range, grouped by
// colour group, then status, then order. Deleted, Order Failed, Awaiting Payment and Awaiting V12 Approval items are left out.
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };

const LABEL = new Map(statuses.map((x) => [x.id, x.label]));
export const LEFT_OUT = [9, 32, 50, 58];
export const MAX_ORDERS = 5000;

// The old page's groups, in its order. A status in two groups belongs to the first.
export const GROUPS = [
  { key: "purple", label: "Replacement / Service / Exchange", tone: "caution", ids: [15, 17, 24, 26, 28, 29, 33, 37, 44, 46, 47, 49, 55, 59, 67, 68, 70, 71, 75, 78, 82] },
  { key: "green", label: "In Stock / Delivered / Collected", tone: "success", ids: [4, 5, 16, 20, 23, 27, 40, 43, 45, 48, 51, 52, 63, 64, 69, 73, 35] },
  { key: "blue", label: "Booked / In Transit / Invoice", tone: "info", ids: [12, 13, 18, 19, 22, 31, 36, 38, 41, 42, 57, 61, 72, 74, 76, 80, 81] },
  { key: "orange", label: "Pending / Waiting / Delayed", tone: "warning", ids: [1, 2, 3, 8, 10, 11, 14, 21, 25, 30, 39, 56, 60, 62, 65, 77] },
  { key: "red", label: "Cancelled / Failed / Discontinued", tone: "critical", ids: [7, 32, 34, 53, 54, 66] },
  { key: "black", label: "Completed (Closed)", tone: "neutral", ids: [6, 79] },
  { key: "other", label: "Other / Not set", tone: "neutral", ids: [] },
];
const GROUP_OF = new Map();
for (const g of GROUPS) for (const id of g.ids) if (!GROUP_OF.has(id)) GROUP_OF.set(id, g.key);
const DISPLAY_ORDER = ["green", "blue", "orange", "purple", "red", "black", "other"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v) => (typeof v === "string" && DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);
const ukDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const shift = (day, { days = 0, months = 0, years = 0 }) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years, d.getUTCMonth() + months, d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const RANGES = { "7d": { days: -7 }, "30d": { days: -30 }, "90d": { days: -90 }, "6m": { months: -6 }, "1y": { years: -1 } };

/** Reads ?from=&to=&range=7d|30d|90d|6m|1y|all&gateway=. Default: the last 90 days, PayPal. */
export function parsePaypalParams(sp, now = new Date()) {
  const today = ukDay(now);
  const range = sp.get("range");
  let from = realDay(sp.get("from"));
  let to = realDay(sp.get("to"));
  if (range === "all") { from = "2013-01-01"; to = today; }
  else if (RANGES[range]) { from = shift(today, RANGES[range]); to = today; }
  if (!from) from = shift(to ?? today, { days: -90 });
  if (!to) to = today;
  if (from > to) [from, to] = [to, from];
  const gateway = (sp.get("gateway") ?? "").trim().toLowerCase().slice(0, 60) || "paypal";
  return { from, to, range: RANGES[range] || range === "all" ? range : "custom", gateway };
}

// The UK day boundaries as times, so the database can filter on createdAt.
const startOf = (day) => new Date(new Date(`${day}T12:00:00Z`).getTime() - londonOffsetMs(day) - 12 * 3600000);
function londonOffsetMs(day) {
  const noon = new Date(`${day}T12:00:00Z`);
  const local = new Date(noon.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(noon.toLocaleString("en-US", { timeZone: "UTC" }));
  return local - utc;
}

const lineValue = (l) => l.priceMinor * l.quantity - l.discountMinor;

/** The report: { totals, groups: [{ key, label, tone, orders, items, valueMinor, statuses: [{ statusId, label, orders, items, valueMinor, list: [order] }] }], gateways } */
export async function paypalReport(db, shop, p) {
  const orders = await db.order.findMany({
    where: { shop, gateway: { contains: p.gateway, mode: "insensitive" }, createdAt: { gte: startOf(p.from), lt: startOf(shift(p.to, { days: 1 })) } },
    select: { orderId: true, name: true, createdAt: true, customerName: true, gateway: true },
    orderBy: { createdAt: "desc" },
    take: MAX_ORDERS + 1,
  });
  const capped = orders.length > MAX_ORDERS;
  const kept = orders.slice(0, MAX_ORDERS);
  const orderOf = new Map(kept.map((o) => [o.orderId, o]));
  const lines = kept.length
    ? await db.orderLine.findMany({
      where: { shop, orderId: { in: [...orderOf.keys()] }, OR: [{ lineStatusId: null }, { lineStatusId: { notIn: LEFT_OUT } }] },
      select: { lineId: true, orderId: true, title: true, sku: true, quantity: true, priceMinor: true, discountMinor: true, lineStatusId: true, expectedDate: true },
    })
    : [];

  // status -> order -> lines
  const byStatus = new Map();
  for (const l of lines) {
    const sid = l.lineStatusId ?? 0;
    if (!byStatus.has(sid)) byStatus.set(sid, new Map());
    const perOrder = byStatus.get(sid);
    if (!perOrder.has(l.orderId)) {
      const o = orderOf.get(l.orderId);
      perOrder.set(l.orderId, { orderId: o.orderId, name: o.name, createdAt: o.createdAt, customerName: o.customerName, valueMinor: 0, items: 0, lines: [] });
    }
    const entry = perOrder.get(l.orderId);
    entry.lines.push({ lineId: l.lineId, title: l.title, sku: l.sku, quantity: l.quantity, valueMinor: lineValue(l), expectedDate: l.expectedDate });
    entry.valueMinor += lineValue(l);
    entry.items += l.quantity;
  }

  const groups = new Map(GROUPS.map((g) => [g.key, { key: g.key, label: g.label, tone: g.tone, orderIds: new Set(), items: 0, valueMinor: 0, statuses: [] }]));
  for (const [sid, perOrder] of byStatus) {
    const list = [...perOrder.values()].sort((a, b) => b.createdAt - a.createdAt);
    const st = {
      statusId: sid || null,
      label: sid ? LABEL.get(sid) ?? `Status ${sid}` : "Not set",
      orders: list.length,
      items: list.reduce((n, o) => n + o.items, 0),
      valueMinor: list.reduce((n, o) => n + o.valueMinor, 0),
      list,
    };
    const g = groups.get(GROUP_OF.get(sid) ?? "other");
    g.statuses.push(st);
    for (const o of list) g.orderIds.add(o.orderId);
    g.items += st.items;
    g.valueMinor += st.valueMinor;
  }
  const out = DISPLAY_ORDER.map((k) => groups.get(k)).filter((g) => g.statuses.length).map(({ orderIds, ...g }) => ({
    ...g,
    orders: orderIds.size,
    statuses: g.statuses.sort((a, b) => b.valueMinor - a.valueMinor),
  }));
  const orderCount = new Set(lines.map((l) => l.orderId)).size;
  const valueMinor = lines.reduce((n, l) => n + lineValue(l), 0);
  const gateways = (await db.order.findMany({ where: { shop, gateway: { not: null } }, select: { gateway: true }, distinct: ["gateway"] })).map((g) => g.gateway).sort();
  return {
    from: p.from, to: p.to, range: p.range, gateway: p.gateway, capped,
    totals: { orders: orderCount, items: lines.reduce((n, l) => n + l.quantity, 0), valueMinor, averageMinor: orderCount ? Math.round(valueMinor / orderCount) : 0 },
    groups: out,
    gateways,
  };
}
