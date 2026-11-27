// Supplier Sales Summary (legacy middle/totalSupplierSaleReport.inc, old Downloads menu): sales per website and per brand for the
// orders placed between two dates. Store orders (paid in the store or taken on Shopify POS) are one "Store Orders" row.
// Each product line's sale is its price times quantity less its discount. Anything else on the order that is not postage or a delivery
// service (a whole-order coupon, configuration price changes, an edit) is shared between its brands by their sales, so each brand's Sale
// Total is what was really charged for its products. The delivery service charges are shared equally between the order's product lines,
// so Grand Total = Sale Total + the delivery shares.
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };

/** As the old page: Cancelled, Deleted, Order Failed, Awaiting Payment, Awaiting V12 Approval and Service Issue orders are left out. */
export const SKIP_STATUS_IDS = [7, 9, 32, 50, 58, 15];
export const STORE = "Store Orders";
export const NO_SITE = "No site";
const MAX_ORDERS = 20000;
const STATUS_LABEL = new Map(statuses.map((s) => [s.id, s.label]));
/** The delivery charges shared out, in the old page's order and with its short names (the reschedule charge is not one of them). */
export const DELIVERY_PARTS = [["two_man", "2Man"], ["white_glove", "WG"], ["scotland", "Scot"], ["postcode_pa_iv_kw", "Far"], ["ireland", "IRE"], ["peace_of_mind", "POM"]];
const SITE_LABELS = { CFS: "CFS — Choice Furniture Superstore", TFS: "TFS — The Furn Shop", FURN: "FURN — Furntastic", UD: "Urban Deco UK", MM: "Manomano", eBay: "eBay" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export function parseSupplierSalesParams(search, today = ukToday()) {
  let from = validDate(search.get("from")) ? search.get("from") : today;
  let to = validDate(search.get("to")) ? search.get("to") : today;
  if (from > to) [from, to] = [to, from];
  return { from, to, detail: search.get("detail") === "1" };
}

/** Replacement orders (number starting with R, like the old RCFS/RTFS/RFURN/RUD/RCSH) are left out. */
export const isReplacement = (name) => /^R/i.test(String(name ?? "").replace(/^#/, ""));
/** Paid in the store (card or cash) or taken on Shopify POS: the old CSH orders and PayByCardStore / PayByCashStore. */
export const isStoreOrder = (o) => /^(paybycardstore|paybycashstore|cash)$/i.test(String(o.gateway ?? "").replace(/[\s_-]+/g, "")) || /^pos$/i.test(o.sourceName ?? "");
const counted = (o) => !o.cancelledAt && !(o.orderStatusId != null && SKIP_STATUS_IDS.includes(o.orderStatusId)) && !isReplacement(o.name);
const charge = (o, key) => Number(o.serviceMinor?.[key] ?? 0) || 0;

/**
 * { from, to, sites: [{ site, label, brands: [{ brand, store, saleMinor, grandMinor, units, orders? }], totals }] }.
 * With detail, each brand lists its orders: sale, qty, delivery parts, grand and a check against the order total.
 */
export function summarise(orders, lines, p) {
  const linesOf = new Map();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);
  const sites = new Map();
  for (const o of orders) {
    if (!counted(o)) continue;
    const ls = linesOf.get(o.orderId) ?? [];
    if (ls.length === 0) continue;
    const siteKey = o.site || NO_SITE;
    if (!sites.has(siteKey)) sites.set(siteKey, new Map());
    const brands = sites.get(siteKey);
    const n = ls.length;
    const byBrand = new Map();
    for (const l of ls) {
      const store = isStoreOrder(o);
      const name = store ? STORE : l.vendor?.trim() || "Unmapped";
      const b = byBrand.get(name) ?? { store, lines: 0, saleMinor: 0, units: 0 };
      b.lines += 1;
      b.saleMinor += l.priceMinor * l.quantity - l.discountMinor;
      b.units += l.quantity;
      byBrand.set(name, b);
    }
    // Share the rest of the order (total less postage, services and the product lines) between the brands by their sales.
    const lineSale = [...byBrand.values()].reduce((s, b) => s + b.saleMinor, 0);
    const services = Object.values(o.serviceMinor ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
    let rest = (o.totalMinor ?? 0) - (o.shippingMinor ?? 0) - services - lineSale;
    const entries = [...byBrand.values()];
    entries.forEach((b, i) => {
      const share = i === entries.length - 1 ? rest : Math.round(((o.totalMinor ?? 0) - (o.shippingMinor ?? 0) - services - lineSale) * (lineSale > 0 ? b.saleMinor / lineSale : b.lines / n));
      b.saleMinor += share;
      rest -= share;
    });
    for (const [name, part] of byBrand) {
      // This brand's share of each delivery charge: the charge / the order's product lines x this brand's lines (as the old page).
      const parts = DELIVERY_PARTS.map(([key, label]) => ({ label, minor: Math.round((charge(o, key) / n) * part.lines) })).filter((x) => x.minor > 0);
      const delMinor = parts.reduce((s, x) => s + x.minor, 0);
      const row = brands.get(name) ?? { brand: name, store: part.store, saleMinor: 0, grandMinor: 0, units: 0, orders: [] };
      row.saleMinor += part.saleMinor;
      row.grandMinor += part.saleMinor + delMinor;
      row.units += part.units;
      if (p.detail) {
        const grand = part.saleMinor + delMinor;
        const split = part.lines < n;
        row.orders.push({
          orderId: o.orderId, name: o.name, createdAt: o.createdAt.toISOString(), status: STATUS_LABEL.get(o.orderStatusId) ?? "", qty: part.units,
          saleMinor: part.saleMinor, parts, grandMinor: grand, split, diffMinor: split ? 0 : grand - o.totalMinor,
        });
      }
      brands.set(name, row);
    }
  }
  const out = [...sites.entries()]
    .sort(([a], [b]) => (a === NO_SITE) - (b === NO_SITE) || a.localeCompare(b))
    .map(([site, brands]) => {
      const rows = [...brands.values()].sort((a, b) => a.brand.localeCompare(b.brand)).map((r) => (p.detail ? r : { ...r, orders: undefined }));
      for (const r of rows) r.orders?.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        site, label: SITE_LABELS[site] ?? site, brands: rows,
        totals: { saleMinor: rows.reduce((s, r) => s + r.saleMinor, 0), grandMinor: rows.reduce((s, r) => s + r.grandMinor, 0), units: rows.reduce((s, r) => s + r.units, 0) },
      };
    });
  return { from: p.from, to: p.to, detail: p.detail, sites: out };
}

export async function supplierSales(db, shop, p) {
  const createdAt = { gte: new Date(`${p.from}T00:00:00.000Z`), lte: new Date(`${p.to}T23:59:59.999Z`) };
  const orders = await db.order.findMany({
    where: { shop, createdAt },
    select: { orderId: true, name: true, createdAt: true, cancelledAt: true, orderStatusId: true, site: true, gateway: true, sourceName: true, serviceMinor: true, totalMinor: true, shippingMinor: true },
    orderBy: { createdAt: "desc" },
    take: MAX_ORDERS,
  });
  const lines = await db.orderLine.findMany({ where: { shop, orderCreatedAt: createdAt }, select: { orderId: true, vendor: true, priceMinor: true, quantity: true, discountMinor: true } });
  return { ...summarise(orders, lines, p), capped: orders.length === MAX_ORDERS };
}
