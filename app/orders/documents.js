// The printable order documents of the legacy order screen: Save PDF, Exc VAT and Inc VAT invoices, the delivery note,
// the shipping label and the return label. Each is a plain HTML page; staff use the browser's Print or Save as PDF.
// Pure: Shopify's data goes in, HTML comes out.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { SERVICES } from "./services.js";

export const KINDS = ["invoice", "exc-vat", "inc-vat", "delivery-note", "label", "return-label"];
export const RETURN_TYPES = { Free_Stock: "Free Stock", Display_Stock: "Display Stock", Send_Back_To_Supplier: "Send Back To Supplier" };

// Line statuses whose items go on a delivery note (the legacy list).
export const DELIVERY_NOTE_STATUS_IDS = [4, 14, 31, 42, 43, 44, 45, 46, 47, 48, 49, 33, 69, 61, 73, 74, 75];
const DELIVERED_STATUS_ID = 6;
const SERVICE_MARKER = /\s*\[svc:([a-z_]+)\]/;

export const COMPANY = {
  address: "Unit 1 15 Bakewell Road, Loughborough, Leicester, LE11 5QY, United Kingdom",
  companyNo: "11530227",
  vatNo: "GB433397583",
};
const DEFAULT_SITE = { name: "Choice Furniture Superstore", url: "https://www.choicefurnituresuperstore.co.uk", email: "customerservice@cfsonline.co.uk", phone: "0116 296 3800", logoUrl: "" };

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const gbp = (minor) => `${minor < 0 ? "−" : ""}£${(Math.abs(minor) / 100).toFixed(2)}`;
const toMinor = (amount) => Math.round(Number(amount ?? 0) * 100);
const money = (set) => toMinor(set?.shopMoney?.amount);
const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

/** The email-site row (or nothing) turned into the header details; CFS when the site is unknown. */
export function siteDetails(row) {
  if (!row) return DEFAULT_SITE;
  return { name: row.name || DEFAULT_SITE.name, url: row.url || DEFAULT_SITE.url, email: row.serviceEmail || DEFAULT_SITE.email, phone: row.phone || DEFAULT_SITE.phone, logoUrl: row.logoUrl || "" };
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
  for (const l of o.lineItems.nodes) {
    if (l.currentQuantity < 1) continue;
    const marker = SERVICE_MARKER.exec(l.title);
    const unit = money(l.originalUnitPriceSet);
    if (marker) {
      services.push({ label: SERVICES.find((s) => s.key === marker[1])?.label ?? l.title.replace(SERVICE_MARKER, ""), minor: unit * l.currentQuantity });
      continue;
    }
    const discount = l.currentQuantity === l.quantity ? (l.discountAllocations ?? []).reduce((sum, a) => sum + money(a.allocatedAmountSet), 0) : 0;
    const status = state.lines?.[l.id]?.statusId ?? null;
    lines.push({
      id: l.id,
      title: l.title,
      variantTitle: l.variantTitle && l.variantTitle !== "Default Title" ? l.variantTitle : "",
      options: (l.customAttributes ?? []).filter((a) => a.key && !String(a.key).startsWith("_")).map((a) => `${a.key}: ${a.value}`),
      sku: l.sku ?? "",
      imageUrl: l.image?.url ?? "",
      qty: l.currentQuantity,
      unitMinor: unit,
      totalMinor: unit * l.currentQuantity,
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
    lines,
    services,
    delivery: (o.shippingLines?.nodes ?? []).map((s) => ({ label: s.title, minor: money(s.originalPriceSet) })),
    coupons: apps.filter((a) => a.__typename === "DiscountCodeApplication").map((a) => a.code),
    subtotalMinor: lines.reduce((sum, l) => sum + l.totalMinor, 0),
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

const statusName = (id) => statuses.find((s) => s.id === id)?.label ?? "Not set";

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1f2933; font-size: 13px; line-height: 1.4; margin: 0; padding: 24px; }
  .bar { margin: 0 0 16px; } .bar button { font-size: 14px; padding: 8px 16px; cursor: pointer; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #9aa5b1; padding-bottom: 3px; }
  .head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 12px; } .head img { max-height: 56px; }
  .muted { color: #52606d; } .cols { display: flex; gap: 32px; } .cols > div { flex: 1; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #cbd2d9; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f2f5; } td.n, th.n { text-align: right; white-space: nowrap; }
  .totals { width: 55%; margin-left: auto; margin-top: 10px; } .totals td { border: none; border-bottom: 1px solid #e4e7eb; } .totals .big td { font-weight: 700; font-size: 15px; }
  .sign td { height: 34px; } .label { border: 2px solid #1f2933; padding: 18px; max-width: 520px; font-size: 18px; } .label b { font-size: 22px; }
  img.p { max-width: 70px; max-height: 70px; }
  @media print { .bar { display: none; } body { padding: 0; } }`;

const page = (title, body) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>${body}</body></html>`;

const company = (site, { vat } = {}) => `<div class="head"><div>${site.logoUrl ? `<img src="${esc(site.logoUrl)}" alt="">` : ""}<h1>${esc(site.name)}</h1><div class="muted">${esc(COMPANY.address)}<br>Tel: ${esc(site.phone)} &bull; ${esc(site.email)}${vat ? `<br>Reg. No ${COMPANY.companyNo} &bull; VAT No ${COMPANY.vatNo}` : ""}</div></div></div>`;
const block = (title, lines, phone) => `<div><h2>${esc(title)}</h2>${lines.map(esc).join("<br>")}${phone ? `<br>Tel: ${esc(phone)}` : ""}</div>`;
const optionsOf = (l) => [l.variantTitle, ...l.options].filter(Boolean).map(esc).join("<br>");

function totalsRows(doc, vat) {
  const rows = [];
  const add = (label, minor, strong) => rows.push(`<tr${strong ? ' class="big"' : ""}><td>${esc(label)}</td><td class="n">${gbp(minor)}</td></tr>`);
  if (vat) add("Subtotal (ex. VAT)", Math.round(doc.subtotalMinor / 1.2));
  else add("Subtotal", doc.subtotalMinor);
  if (doc.discountMinor) add(doc.coupons.length ? `Discount (coupon ${doc.coupons.join(", ")})` : "Discount", -doc.discountMinor);
  for (const d of doc.delivery) if (d.minor) add(d.label, d.minor);
  for (const s of doc.services) add(s.label, s.minor);
  // The legacy VAT row: 20% included in the grand total (one sixth of it).
  if (vat) add("VAT (20%)", Math.round(doc.totalMinor / 6));
  add(vat ? "Grand Total (inc. VAT)" : "Grand Total", doc.totalMinor, true);
  add("Paid", doc.paidMinor);
  add("Balance Due", doc.balanceMinor);
  return `<table class="totals">${rows.join("")}</table>`;
}

/** The Exc VAT and Inc VAT invoices (print-invoice.php, print-vat-invoice.php). */
export function invoiceHtml(doc, site, { vat }) {
  const title = `${vat ? "Tax Invoice" : "Invoice"} #${doc.name}`;
  const lines = doc.lines.map((l) => `<tr><td>${esc(l.title)}</td><td>${optionsOf(l)}</td><td>${esc(l.sku)}</td><td class="n">${l.qty}</td><td class="n">${gbp(l.unitMinor)}</td><td class="n">${gbp(l.totalMinor)}</td><td class="n">${l.discountMinor ? gbp(-l.discountMinor) : "—"}</td><td class="n">${gbp(l.finalMinor)}</td></tr>`).join("");
  return page(title, `${company(site, { vat })}<h1>${esc(title)}</h1><div class="muted">Date: ${esc(longDate(doc.createdAt))}</div>
    <div class="cols">${block("Billing Address", doc.billing, doc.billingPhone)}${block("Shipping Address", doc.shipping, doc.shippingPhone)}</div>
    <h2>Order Items</h2><table><tr><th>Item</th><th>Options</th><th>SKU</th><th class="n">Qty</th><th class="n">Unit Price</th><th class="n">Amount</th><th class="n">Discount</th><th class="n">Final Price</th></tr>${lines}</table>
    ${totalsRows(doc, vat)}<p class="muted">Thank you for your order!${vat ? ` Reg. No: ${COMPANY.companyNo} — VAT No: ${COMPANY.vatNo}` : ""}</p>`);
}

/** Save PDF (orderInvoice.php): the compact Tax Invoice with product pictures and delivery dates. */
export function savePdfHtml(doc, site) {
  const rows = doc.lines.map((l) => `<tr><td>${l.imageUrl ? `<img class="p" src="${esc(l.imageUrl)}" alt="">` : ""}</td><td><b>${esc(l.title)}</b>${optionsOf(l) ? `<br>${optionsOf(l)}` : ""}${l.expectedDate ? `<br>Delivery: ${esc(dmy(l.expectedDate))}` : ""}</td><td class="n">${gbp(l.unitMinor)}</td><td class="n">${l.qty}</td><td class="n">${gbp(l.totalMinor)}</td></tr>`).join("");
  return page(`Invoice ${doc.name}`, `${company(site, { vat: true })}<h1>Tax Invoice</h1><div class="muted">${esc(site.url)}<br>Invoice No ${esc(doc.name)} &bull; Date ${esc(longDate(doc.createdAt))}</div>
    <div class="cols">${block("Bill To", doc.billing, doc.billingPhone)}${block("Shipping Address", doc.shipping, doc.shippingPhone)}</div>
    <h2>Order Items</h2><table><tr><th>Image</th><th>Description</th><th class="n">Unit Price</th><th class="n">Qty</th><th class="n">Amount</th></tr>${rows}</table>
    ${totalsRows(doc, false)}
    <h2>Delivery &amp; Billing Information</h2><div class="cols">${block("Delivery Details", doc.shipping, doc.shippingPhone)}${block("Billing Details", [...doc.billing, doc.email && `Email: ${doc.email}`].filter(Boolean), doc.billingPhone)}</div>
    <p class="muted">Thank you for choosing ${esc(site.name)} — We appreciate your business<br>${esc(site.url)} &bull; Tel: ${esc(site.phone)} &bull; ${esc(site.email)}</p>`);
}

/** The delivery note (print-delivery-notes.php): only lines in a printable status, delivered items listed apart. */
export function deliveryNoteHtml(doc, site, now = new Date()) {
  const onNote = doc.lines.filter((l) => DELIVERY_NOTE_STATUS_IDS.includes(l.statusId));
  const delivered = doc.lines.filter((l) => l.statusId === DELIVERED_STATUS_ID);
  const rows = onNote.map((l) => `<tr><td>${esc(l.title)}${optionsOf(l) ? `<br><span class="muted">${optionsOf(l)}</span>` : ""}</td><td>${esc(l.sku)}</td><td class="n">${l.qty}</td><td>${esc(statusName(l.statusId))}</td></tr>`).join("");
  const done = delivered.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.title)}</td><td class="n">${l.qty}</td><td></td></tr>`).join("");
  return page(`Delivery Note ${doc.name}`, `${company(site)}<h1>Details of Invoice# ${esc(doc.name)}</h1><div class="muted">Invoice Date: ${esc(longDate(doc.createdAt))} &bull; Note Date: ${esc(longDate(now.toISOString()))}</div>
    ${block("Shipping Address", doc.shipping, doc.shippingPhone)}${doc.email ? `<div>Email: ${esc(doc.email)}</div>` : ""}
    <h2>Delivery Instruction</h2>
    <div>Assigned Container / Freestock Info: <span class="muted">______________________</span></div>
    <div>Customer Instruction: ${esc(doc.note)}</div><div>Other Instructions: ${esc(doc.instructions)}</div>
    <h2>Items</h2><table><tr><th>Item</th><th>Product Code</th><th class="n">Quantity</th><th>Order Status</th></tr>${rows}</table>
    <div style="margin-top:8px">Boxes: ______</div>
    ${delivered.length ? `<h2>Already Delivered Items</h2><table><tr><th>S.No.</th><th>Item</th><th class="n">Qty.</th><th>Date</th></tr>${done}</table>` : ""}
    <table class="sign" style="margin-top:18px"><tr><td>Signature :</td><td>Name :</td></tr><tr><td>Date :</td><td>Time :</td></tr></table>
    <div style="margin-top:8px">Total No. of Boxes: ______</div><p>Thank You</p>`);
}

/** The shipping address label (print_label.php). */
export function labelHtml(doc) {
  return page(`Order ${doc.name}`, `<div class="label"><div class="muted">Shipping Address</div><div>Order No: <b>${esc(doc.name)}</b></div><br>${doc.shipping.map((l) => `<b>${esc(l)}</b>`).join("<br>")}${doc.shippingPhone ? `<br><br>Tel: ${esc(doc.shippingPhone)}` : ""}</div>`);
}

/** The return label (print_return_label.php): the ticked lines with their quantities, under the chosen type. */
export function returnLabelHtml(doc, lineIds, type) {
  const picked = doc.lines.filter((l) => lineIds.includes(l.id));
  const items = picked.map((l) => `<tr><td>${esc(l.title)}${optionsOf(l) ? `<br><span class="muted">${optionsOf(l)}</span>` : ""}</td><td>${esc(l.sku)}</td><td class="n">${l.qty}</td></tr>`).join("");
  return page(`Return Label ${doc.name}`, `<div class="label"><div class="muted">Return Label - ${esc(RETURN_TYPES[type] ?? type)}</div><div>Order No: <b>${esc(doc.name)}</b></div><br>${doc.shipping.map((l) => `<b>${esc(l)}</b>`).join("<br>")}</div>
    <h2>Items</h2><table style="max-width:520px"><tr><th>Item</th><th>SKU</th><th class="n">Qty</th></tr>${items}</table>`);
}
