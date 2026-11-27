// Marketing Sales Report (legacy middle/marketing_sales.php, old Downloads menu): item sales of eligible orders placed between two dates,
// filtered by brand, range, category, product, site, order source and status, broken down by brand, range, category, product, month,
// day, order source or order. Sales are each product line's saved value (price x quantity less its discount): delivery and order-level
// adjustments are left out and refunds are not subtracted, as the old report.
import statuses from "../../extensions/cfs-order-status/src/statuses.json" with { type: "json" };
import { buildCsv } from "./export-rules.js";

/** Cancelled, Deleted, Order Failed, Awaiting Payment, Payment Not Confirmed, Awaiting V12 Approval, Cancel-Removed, Payment Not Come. */
export const EXCLUDED_STATUS_IDS = [7, 9, 32, 50, 56, 58, 66, 77];
export const ELIGIBLE_STATUSES = statuses.filter((s) => !EXCLUDED_STATUS_IDS.includes(s.id)).sort((a, b) => a.label.localeCompare(b.label));
export const GROUPS = { brand: "Brand", range: "Range", category: "Category", product: "Product", month: "Month", day: "Day", source: "Order source", order: "Orders" };
export const SORTS = ["sales", "units", "orders", "name"];
export const PAGE_SIZE = 100;
export const MAX_EXPORT_ROWS = 10000;
const MAX_ORDERS = 20000;
const UNSPECIFIED = "__unspecified__";
export const NO_RANGE = "No collection";
export const NO_CATEGORY = "No category";
export const UNMAPPED = "Unmapped";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const ukDate = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const text = (search, key, max = 200) => (search.get(key) ?? "").trim().slice(0, max);

/** Reads the filters. Returns { value } or { error } (a message for staff). With no dates it is this month up to today, as the old report. */
export function parseMarketingParams(search, today = ukDate(new Date())) {
  const from = search.get("from") || `${today.slice(0, 8)}01`;
  const to = search.get("to") || today;
  if (!validDate(from) || !validDate(to) || from > to || from < "2010-01-01" || to > "2100-12-31") return { error: "Choose a valid start and end date (start must not be after end)." };
  const status = Number.parseInt(search.get("status") ?? "", 10) || 0;
  if (status && !ELIGIBLE_STATUSES.some((s) => s.id === status)) return { error: "Cancelled, failed and unpaid statuses cannot be included." };
  const product = text(search, "product", 20);
  if (product && !/^\d{1,20}$/.test(product)) return { error: "The product ID is a number." };
  const order = text(search, "order", 20);
  const group = Object.hasOwn(GROUPS, search.get("group") ?? "") ? search.get("group") : "brand";
  const sort = SORTS.includes(search.get("sort")) ? search.get("sort") : "sales";
  const page = Math.max(1, Math.min(10000, Number.parseInt(search.get("page") ?? "1", 10) || 1));
  return {
    value: {
      from, to, brand: text(search, "brand"), range: text(search, "range"), category: text(search, "category"), product, search: text(search, "search", 100),
      site: text(search, "site", 50), source: text(search, "source", 100), status, order: /^\d{1,20}$/.test(order) ? order : "", group, sort, page,
    },
  };
}

/** The filters as a query string (for the download link). Empty values are left out. */
export function marketingQuery(p) {
  const q = new URLSearchParams();
  for (const k of ["from", "to", "brand", "range", "category", "product", "search", "site", "source", "order", "group", "sort"]) if (p[k]) q.set(k, String(p[k]));
  if (p.status) q.set("status", String(p.status));
  return q.toString();
}

const isReplacement = (name) => /^R/i.test(String(name ?? "").replace(/^#/, ""));
const numericId = (gid) => (gid ? String(gid).split("/").pop() : "");

// ---- Range (collections) and category of each product, from Shopify. Kept for 10 minutes so changing filters is quick. ----
const CATALOG_QUERY = `#graphql
  query CfsMarketingCatalog($ids: [ID!]!) {
    nodes(ids: $ids) { ... on Product { id productType category { name } collections(first: 20) { nodes { title } } } }
  }`;
const CATALOG_TTL = 10 * 60 * 1000;
const catalogCache = new Map(); // `${shop}|${productId}` -> { ranges, category, at }
export const clearCatalogCache = () => catalogCache.clear();

/** Map productId -> { ranges: string[], category: string }. Throws when Shopify cannot be read. */
export async function productCatalog(graphql, shop, productIds, now = Date.now()) {
  const out = new Map();
  const missing = [];
  for (const id of new Set(productIds.filter(Boolean))) {
    const hit = catalogCache.get(`${shop}|${id}`);
    if (hit && now - hit.at < CATALOG_TTL) out.set(id, hit);
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += 100) {
    const ids = missing.slice(i, i + 100);
    const body = await (await graphql(CATALOG_QUERY, { variables: { ids } })).json();
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
    const found = new Map((body.data?.nodes ?? []).filter((n) => n?.id).map((n) => [n.id, n]));
    for (const id of ids) {
      const n = found.get(id);
      const entry = { ranges: (n?.collections?.nodes ?? []).map((c) => c.title.trim()).filter(Boolean), category: n?.category?.name?.trim() || n?.productType?.trim() || "", at: now };
      catalogCache.set(`${shop}|${id}`, entry);
      out.set(id, entry);
    }
  }
  return out;
}

// ---- The sold items and the report. ----

/** The eligible product lines on the filters (all but range and category, which need the catalogue). */
export async function soldLines(db, shop, p) {
  const createdAt = { gte: new Date(`${p.from}T00:00:00.000Z`), lte: new Date(`${p.to}T23:59:59.999Z`) };
  const statusWhere = p.status ? { orderStatusId: p.status } : { OR: [{ orderStatusId: null }, { orderStatusId: { notIn: EXCLUDED_STATUS_IDS } }] };
  const where = { shop, createdAt, totalMinor: { gt: 0 }, cancelledAt: null, ...statusWhere };
  if (p.site === UNSPECIFIED) where.site = null;
  else if (p.site) where.site = p.site;
  if (p.source === UNSPECIFIED) where.orderSource = null;
  else if (p.source) where.orderSource = p.source;
  if (p.order) where.orderId = `gid://shopify/Order/${p.order}`;
  const orders = (await db.order.findMany({ where, select: { orderId: true, name: true, createdAt: true, orderSource: true }, take: MAX_ORDERS })).filter((o) => !isReplacement(o.name));
  if (orders.length === 0) return { items: [], capped: false };
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  const lineWhere = { shop, orderId: { in: [...byId.keys()] }, quantity: { gt: 0 }, OR: [{ lineStatusId: null }, { lineStatusId: { notIn: EXCLUDED_STATUS_IDS } }] };
  if (p.product) lineWhere.productId = `gid://shopify/Product/${p.product}`;
  const and = [];
  // Items without a brand show as "Unmapped"; choosing that row finds them.
  if (p.brand === UNMAPPED) and.push({ OR: [{ vendor: null }, { vendor: "" }] });
  else if (p.brand) lineWhere.vendor = p.brand;
  if (p.search) and.push({ OR: [{ title: { contains: p.search, mode: "insensitive" } }, { sku: { contains: p.search, mode: "insensitive" } }] });
  const lines = await db.orderLine.findMany({ where: and.length ? { ...lineWhere, AND: and } : lineWhere, select: { orderId: true, vendor: true, productId: true, title: true, sku: true, quantity: true, priceMinor: true, discountMinor: true } });
  const items = lines.map((l) => {
    const o = byId.get(l.orderId);
    return { orderId: l.orderId, orderName: o.name, placed: o.createdAt, source: o.orderSource ?? "", brand: l.vendor?.trim() || UNMAPPED, productId: l.productId, title: l.title, sku: l.sku ?? "", units: l.quantity, sales: l.priceMinor * l.quantity - l.discountMinor };
  });
  return { items, capped: orders.length === MAX_ORDERS };
}

/** Adds each item's ranges and category, then keeps those matching the range and category filters. */
export function withCatalog(items, catalog, p) {
  return items
    .map((it) => {
      const c = catalog.get(it.productId);
      return { ...it, ranges: c?.ranges?.length ? c.ranges : [NO_RANGE], category: c?.category || NO_CATEGORY };
    })
    .filter((it) => (!p.range || it.ranges.includes(p.range)) && (!p.category || it.category === p.category));
}

const dayLabel = (d) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", year: "numeric" });
/** The group keys of one item (a product in two collections is in both ranges). */
function keysOf(it, group) {
  switch (group) {
    case "brand": return [[it.brand, it.brand]];
    case "range": return it.ranges.map((r) => [r, r]);
    case "category": return [[it.category, it.category]];
    case "product": return [[it.productId ? numericId(it.productId) : `unknown:${it.sku}:${it.title}`, it.title]];
    case "month": { const d = ukDate(it.placed).slice(0, 7); return [[d, d]]; }
    case "day": { const d = ukDate(it.placed); return [[d, d]]; }
    case "source": return [[it.source || "Unspecified", it.source || "Unspecified"]];
    case "order": return [[numericId(it.orderId), `${it.orderName} | ${dayLabel(it.placed)}`]];
    default: return [[it.brand, it.brand]];
  }
}

/** { summary, rows (all groups, sorted), groupCount }. */
export function summarise(items, p) {
  const orders = new Set();
  const products = new Set();
  let units = 0;
  let sales = 0;
  const groups = new Map();
  for (const it of items) {
    orders.add(it.orderId);
    if (it.productId) products.add(it.productId);
    units += it.units;
    sales += it.sales;
    for (const [key, name] of keysOf(it, p.group)) {
      const g = groups.get(key) ?? { key, name, productId: "", sku: "", orders: new Set(), units: 0, salesMinor: 0, placed: it.placed };
      g.orders.add(it.orderId);
      g.units += it.units;
      g.salesMinor += it.sales;
      if (p.group === "product") { g.productId = numericId(it.productId); g.sku = g.sku || it.sku; }
      if (p.group === "order") g.productId = numericId(it.orderId);
      groups.set(key, g);
    }
  }
  const rows = [...groups.values()].map((g) => ({ key: g.key, name: g.name, productId: g.productId, sku: g.sku, orders: g.orders.size, units: g.units, salesMinor: g.salesMinor, placed: g.placed }));
  const byName = (a, b) => (p.group === "order" ? a.placed - b.placed : a.name.localeCompare(b.name)) || a.key.localeCompare(b.key);
  const metric = { sales: "salesMinor", units: "units", orders: "orders" }[p.sort];
  rows.sort((a, b) => (metric ? b[metric] - a[metric] : 0) || byName(a, b));
  return { summary: { orders: orders.size, units, salesMinor: sales, products: products.size }, rows: rows.map(({ placed, ...r }) => r), groupCount: rows.length };
}

/** Everything the page shows: summary, one page of rows, and the choices for the filters. */
export async function marketingReport(db, graphql, shop, p) {
  const { items, capped } = await soldLines(db, shop, { ...p });
  let catalogOk = true;
  let catalog = new Map();
  try {
    catalog = await productCatalog(graphql, shop, items.map((i) => i.productId));
  } catch (error) {
    console.error("Marketing sales: catalogue lookup failed", error.message);
    catalogOk = false;
  }
  const full = withCatalog(items, catalog, p);
  const { summary, rows, groupCount } = summarise(full, p);
  const pageCount = Math.max(1, Math.ceil(groupCount / PAGE_SIZE));
  const page = Math.min(p.page, pageCount);
  const choiceItems = withCatalog(items, catalog, { ...p, range: "", category: "" });
  const [brandRows, siteRows, sourceRows] = await Promise.all([
    db.orderLine.findMany({ where: { shop, vendor: { not: null } }, distinct: ["vendor"], select: { vendor: true } }),
    db.order.findMany({ where: { shop }, distinct: ["site"], select: { site: true } }),
    db.order.findMany({ where: { shop }, distinct: ["orderSource"], select: { orderSource: true } }),
  ]);
  const sorted = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    filters: p, summary, rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), groupCount, page, pageCount, pageSize: PAGE_SIZE, capped, catalogOk,
    choices: {
      brands: sorted(brandRows.map((r) => r.vendor.trim())),
      ranges: sorted(choiceItems.flatMap((i) => i.ranges)),
      categories: sorted(choiceItems.map((i) => i.category)),
      sites: sorted(siteRows.map((r) => r.site)), hasNoSite: siteRows.some((r) => !r.site),
      sources: sorted(sourceRows.map((r) => r.orderSource)),
      statuses: ELIGIBLE_STATUSES,
    },
    selectedOrder: p.order ? full[0]?.orderName ?? "" : "",
    selectedProduct: p.product ? full[0]?.title ?? "" : "",
  };
}

/** The CSV: the old file's heading lines, then one row per group (all pages). { csv, count } or { error }. */
export async function marketingCsv(db, graphql, shop, p) {
  const { items } = await soldLines(db, shop, p);
  let catalog = new Map();
  try {
    catalog = await productCatalog(graphql, shop, items.map((i) => i.productId));
  } catch (error) {
    console.error("Marketing sales: catalogue lookup failed", error.message);
  }
  const { rows, groupCount } = summarise(withCatalog(items, catalog, p), p);
  if (groupCount > MAX_EXPORT_ROWS) return { error: "Export exceeds 10,000 rows. Narrow the dates or filters before exporting. No partial export was created." };
  const detail = p.group === "product" || p.group === "order";
  const lines = [
    ["Marketing sales report", p.from, p.to, "GBP"],
    ["Coverage", `Site: ${p.site === UNSPECIFIED ? "Unspecified" : p.site || "All sites"}`, `Source: ${p.source === UNSPECIFIED ? "Unspecified" : p.source || "All sources"}`, `Brand: ${p.brand || "All"}`, `Range: ${p.range || "All"}`, `Category: ${p.category || "All"}`, `Product ID: ${p.product || "All"}`, `Search: ${p.search}`, `Status: ${p.status ? statuses.find((s) => s.id === p.status)?.label : "All eligible"}`, `Order: ${p.order}`],
    ["Rules", "Cancelled, failed, unpaid and replacement orders excluded. Refunds/returns not adjusted. Saved final item value; excludes delivery and order-level charges."],
  ];
  const head = [GROUPS[p.group], p.group === "order" ? "Order ID" : "Product ID (product view only)", p.group === "order" ? "Record source" : "SKU (product view only)", "Orders", "Units", "Item sales GBP"];
  const body = rows.map((r) => [r.name, detail ? r.productId : "", p.group === "order" ? "Current" : p.group === "product" ? r.sku : "", r.orders, r.units, (r.salesMinor / 100).toFixed(2)]);
  const csv = "﻿" + buildCsv(lines[0], [...lines.slice(1), head, ...body]);
  return { csv, count: rows.length };
}

export const marketingFileName = (p) => `marketing-sales-${p.from}-to-${p.to}.csv`;
