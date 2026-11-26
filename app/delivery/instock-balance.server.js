// Instock Balance Due (legacy "instock_balance_pending"): orders that still owe money while every product line is
// Coming IN, In Stock or Allocated From Stock (status 4, 14 or 43).
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };

export const PAGE_SIZE = 50;
export const BALANCE_STATUSES = [4, 14, 43];
const label = new Map(statuses.map((s) => [s.id, s.label]));

/** Is this order on the page? Not cancelled, a balance owed, and no line outside the three statuses. */
export const owesWhileInstock = (o) =>
  !o.cancelledAt && !o.archivedAt && o.outstandingMinor > 0 && Array.isArray(o.lineStatusIds) && o.lineStatusIds.length > 0 && o.lineStatusIds.every((s) => BALANCE_STATUSES.includes(s));

/** Reads ?page=&all=1. */
export function parseBalanceParams(searchParams) {
  const page = Number(searchParams.get("page"));
  return { all: searchParams.get("all") === "1", page: Number.isInteger(page) && page >= 1 ? Math.min(page, 100000) : 1 };
}

const toRow = (o) => ({
  orderId: o.orderId, orderName: String(o.name).replace(/^#/, ""), orderDate: o.createdAt, customer: o.customerName ?? "", postcode: o.postcode ?? "", payment: o.gateway ?? "",
  totalMinor: o.totalMinor, balanceMinor: o.outstandingMinor, statuses: o.lineStatusIds,
});

/** { rows, total, page, pageCount, size, balanceMinor } newest order first; balanceMinor adds up the rows shown. */
export async function listInstockBalance(db, shop, params = {}) {
  const found = await db.order.findMany({
    where: { shop, cancelledAt: null, archivedAt: null, outstandingMinor: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, name: true, createdAt: true, cancelledAt: true, archivedAt: true, customerName: true, postcode: true, gateway: true, totalMinor: true, outstandingMinor: true, lineStatusIds: true },
  });
  const all = found.filter(owesWhileInstock).map(toRow);
  const total = all.length;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = params.all ? 1 : Math.min(Math.max(1, params.page ?? 1), pageCount);
  const rows = params.all ? all : all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows, total, page, pageCount, size: PAGE_SIZE, balanceMinor: rows.reduce((s, r) => s + r.balanceMinor, 0) };
}

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (minor) => (minor / 100).toFixed(2);
const longDate = (d) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "long", year: "numeric" }).replace(/^(\d+) (\w+) (\d+)$/, "$2 $1 $3");

/** The old download: Order No, Order Date, Customer, Grand Total, Balance Amount, Status (the first line's). */
export function instockBalanceCsv(rows) {
  const head = "Order No,Order Date,Customer,Grand Total,Balance Amount,Status";
  const body = rows.map((r) => [r.orderName, longDate(r.orderDate), r.customer, money(r.totalMinor), money(r.balanceMinor), label.get(r.statuses[0]) ?? ""].map(cell).join(","));
  return `\uFEFF${[head, ...body].join("\r\n")}\r\n`;
}

/** The rows for the ticked orders (numeric order ids) of the whole list. */
export async function balanceRowsFor(db, shop, numericIds) {
  const wanted = new Set(numericIds.map((n) => `gid://shopify/Order/${n}`));
  const { rows } = await listInstockBalance(db, shop, { all: true });
  return rows.filter((r) => wanted.has(r.orderId));
}
