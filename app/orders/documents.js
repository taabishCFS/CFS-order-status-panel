// The printable order documents of the legacy order screen: Save PDF, Exc VAT and Inc VAT invoices, the delivery note,
// the shipping label and the return label. Each is a plain HTML page; staff use the browser's Print or Save as PDF.
// Pure: Shopify's data goes in, HTML comes out.
import { CFS_LOGO } from "./logo.js";
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { SERVICES } from "./services.js";

export const KINDS = ["invoice", "exc-vat", "inc-vat", "delivery-note", "label", "return-label"];
export const RETURN_TYPES = { Free_Stock: "Free Stock", Display_Stock: "Display Stock", Send_Back_To_Supplier: "Send Back To Supplier" };

// Line statuses whose items go on a delivery note (the legacy list).
export const DELIVERY_NOTE_STATUS_IDS = [4, 14, 31, 42, 43, 44, 45, 46, 47, 48, 49, 33, 69, 61, 73, 74, 75];
export const DELIVERED_STATUS_ID = 6;
export const statusName = (id) => statuses.find((s) => s.id === id)?.label ?? "Not set";
export const mdyDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
export const dmyDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
const CONFIG_MARKER = /\[cfg:(\d+):v\d+\]/;
const SERVICE_MARKER = /\s*\[svc:([a-z_]+)\]/;

export const COMPANY = {
  address: "Unit 1 15 Bakewell Road, Loughborough, Leicester, LE11 5QY, United Kingdom",
  companyNo: "11530227",
  vatNo: "GB433397583",
};
const DEFAULT_SITE = { name: "Choice Furniture Superstore", url: "https://www.choicefurnituresuperstore.co.uk", email: "customerservice@cfsonline.co.uk", phone: "0116 296 3800", logoUrl: CFS_LOGO };

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const gbp = (minor) => `${minor < 0 ? "−" : ""}£${(Math.abs(minor) / 100).toFixed(2)}`;
const toMinor = (amount) => Math.round(Number(amount ?? 0) * 100);
const money = (set) => toMinor(set?.shopMoney?.amount);
export const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
export const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

/** The email-site row (or nothing) turned into the header details; CFS when the site is unknown. */
export function siteDetails(row) {
  if (!row) return DEFAULT_SITE;
  return { name: row.name || DEFAULT_SITE.name, url: row.url || DEFAULT_SITE.url, email: row.serviceEmail || DEFAULT_SITE.email, phone: row.phone || DEFAULT_SITE.phone, logoUrl: DEFAULT_SITE.logoUrl }; // the legacy used the one CFS logo for every site; the email-site logo link is not used here
}

/** "site:TFS" from the tags, or null. */
export const siteCodeOf = (tags) => (tags ?? []).map((t) => /^site:(.+)$/i.exec(t)?.[1]).find(Boolean)?.toUpperCase() ?? null;

function addressLines(a) {
  if (!a) return [];
  return [a.name, a.address1, a.address2, a.city, a.province, a.zip, a.country].filter((x) => x && String(x).trim());
}

/** The order as the documents need it, from Shopify's order (see documents.server.js) and the saved status record (JSON text or null). */
export function shapeDocOrder(o, stateJson) {
  let state = {};
  try {
    state = stateJson ? JSON.parse(stateJson) : {};
  } catch {
    state = {};
  }
  const apps = o.discountApplications?.nodes ?? [];
  const lines = [];
  const services = [];
  // A configuration change is a separate price-difference line in Shopify. On the documents it is folded into the product it belongs to.
  const folds = new Map();
  for (const l of o.lineItems.nodes) {
    const m = CONFIG_MARKER.exec(l.title);
    if (m && l.currentQuantity > 0) folds.set(m[1], (folds.get(m[1]) ?? 0) + money(l.originalUnitPriceSet) * l.currentQuantity);
  }
  for (const l of o.lineItems.nodes) {
    if (l.currentQuantity < 1) continue;
    if (CONFIG_MARKER.test(l.title)) continue;
    const marker = SERVICE_MARKER.exec(l.title);
    const folded = folds.get(String(l.id).split("/").pop()) ?? 0;
    const unit = money(l.originalUnitPriceSet) + Math.round(folded / l.currentQuantity);
    if (marker) {
      services.push({ label: SERVICES.find((s) => s.key === marker[1])?.label ?? l.title.replace(SERVICE_MARKER, ""), minor: unit * l.currentQuantity });
      continue;
    }
    // Coupon codes are the coupon column; every other discount (the automatic offer, a manual price change) is the offer column.
    let offer = 0;
    let coupon = 0;
    if (l.currentQuantity === l.quantity) {
      for (const a of l.discountAllocations ?? []) {
        const kind = apps[a.discountApplication?.index]?.__typename;
        if (kind === "DiscountCodeApplication") coupon += money(a.allocatedAmountSet);
        else offer += money(a.allocatedAmountSet);
      }
    }
    const discount = offer + coupon;
    const status = state.lines?.[l.id]?.statusId ?? null;
    lines.push({
      id: l.id,
      title: l.title,
      variantTitle: l.variantTitle && l.variantTitle !== "Default Title" ? l.variantTitle : "",
      options: (l.customAttributes ?? []).filter((a) => a.key && !String(a.key).startsWith("_")).map((a) => `${a.key}: ${a.value}`),
      sku: l.sku ?? "",
      code: "", // the legacy product code; Shopify has no field for it yet (staff question)
      imageUrl: l.image?.url ?? "",
      qty: l.currentQuantity,
      unitMinor: unit,
      totalMinor: unit * l.currentQuantity,
      offerMinor: offer,
      couponMinor: coupon,
      discountMinor: discount,
      finalMinor: unit * l.currentQuantity - discount,
      statusId: typeof status === "number" ? status : null,
      expectedDate: state.expected?.[l.id]?.date ?? "",
    });
  }
  const shippingMinor = (o.shippingLines?.nodes ?? []).reduce((sum, s) => sum + money(s.originalPriceSet), 0);
  const servicesMinor = services.reduce((sum, s) => sum + s.minor, 0);
  const totalMinor = money(o.currentTotalPriceSet);
  const outstanding = money(o.totalOutstandingSet);
  return {
    name: o.name,
    createdAt: o.createdAt,
    email: o.email ?? "",
    phone: o.phone ?? o.shippingAddress?.phone ?? "",
    note: o.note ?? "",
    billing: addressLines(o.billingAddress ?? o.shippingAddress),
    billingPhone: o.billingAddress?.phone ?? "",
    shipping: addressLines(o.shippingAddress ?? o.billingAddress),
    shippingPhone: o.shippingAddress?.phone ?? "",
    shippingRaw: o.shippingAddress ?? null,
    billingRaw: o.billingAddress ?? o.shippingAddress ?? null,
    lines,
    services,
    delivery: (o.shippingLines?.nodes ?? []).map((s) => ({ label: s.title, minor: money(s.originalPriceSet) })),
    coupons: apps.filter((a) => a.__typename === "DiscountCodeApplication").map((a) => a.code),
    // The legacy coupon row shows the coupon's value: "12%" or "£5.00".
    couponValue: (() => {
      const c = apps.find((a) => a.__typename === "DiscountCodeApplication");
      if (!c) return "";
      return c.value?.percentage != null ? `${c.value.percentage}%` : c.value?.amount != null ? gbp(toMinor(c.value.amount)) : c.code;
    })(),
    orderStatus: typeof state.order?.statusId === "number" ? statusName(state.order.statusId) : "",
    deliveryMethod: (o.shippingLines?.nodes ?? []).map((s) => s.title).join(", "),
    subtotalMinor: lines.reduce((sum, l) => sum + l.totalMinor, 0),
    offerMinor: lines.reduce((sum, l) => sum + l.offerMinor, 0),
    couponMinor: lines.reduce((sum, l) => sum + l.couponMinor, 0),
    discountMinor: lines.reduce((sum, l) => sum + l.discountMinor, 0),
    shippingMinor,
    servicesMinor,
    totalMinor,
    paidMinor: money(o.totalReceivedSet),
    balanceMinor: outstanding,
    instructions: state.instructions?.text ?? "",
    condition: state.condition?.value ?? null,
    siteCode: siteCodeOf(o.tags),
  };
}

/** { ok } or { ok: false, reason }: the legacy rules (balance owed, 50% or 75% refund) plus at least one line in a printable status. */
export function deliveryNoteAllowed(doc) {
  if (doc.balanceMinor > 0) return { ok: false, reason: "A balance is still owed on this order." };
  if (doc.condition === "75percRefund" || doc.condition === "50percRefund") return { ok: false, reason: "This order is on a 50% or 75% refund condition." };
  if (!doc.lines.some((l) => DELIVERY_NOTE_STATUS_IDS.includes(l.statusId))) return { ok: false, reason: "No product on this order is in a status that goes on a delivery note." };
  return { ok: true };
}

