// Printable pages. The invoices, the delivery note and Save PDF copy the legacy pages and the sample PDFs.
import { COMPANY, DELIVERY_NOTE_STATUS_IDS, DELIVERED_STATUS_ID, RETURN_TYPES, esc, gbp, longDate, mdyDate, dmyDate, dmy, statusName } from "./documents.js";
import { TERMS_HTML } from "./terms.js";

const num = (doc) => String(doc.name).replace(/^#/, "");
const showTerms = (doc) => !doc.siteCode || doc.siteCode === "CFS";
const dashPhone = (p) => String(p).replace(/\s+/g, "-");
const optionLines = (l) => [l.variantTitle && `Option : ${l.variantTitle}`, ...l.options.map((o) => o.replace(/: /, " : "))].filter(Boolean);

const BAR = `<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>`;
const shell = (title, css, body) =>
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>${esc(title)}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}.bar{padding:12px 24px}.bar button{font-size:14px;padding:8px 16px;cursor:pointer}@media print{.bar{display:none}}${css}</style></head><body>${BAR}${body}</body></html>`;

// ----- Invoice (Exc VAT and Inc VAT) -----
const INVOICE_CSS = `
  body{margin:0;font-family:"Noto Sans","Open Sans","Segoe UI",Arial,sans-serif;color:#1f2933;font-size:12px;line-height:1.5}
  .inv{max-width:760px;margin:0 auto;padding:24px 32px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a2340}
  .top img{max-height:70px}.top .r{text-align:right}.top h1{margin:0;font-size:30px;letter-spacing:1px;color:#1a2340}
  .top .r div{margin-top:3px}.pill{display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:10px;letter-spacing:1.5px;padding:3px 12px;border-radius:4px;margin-top:6px}
  .from{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #d9dde3}.from b{font-size:14px;color:#111}.from .muted{color:#52606d}
  .reg{text-align:right;font-size:10px;letter-spacing:1px;color:#52606d}.reg b{font-size:12px;color:#111;letter-spacing:0;margin-left:6px}
  .addr{display:flex;border-bottom:1px solid #d9dde3}.addr>div{flex:1;padding:14px 22px 14px 0;line-height:1.9}.addr>div+div{border-left:1px solid #d9dde3;padding-left:22px}
  .lbl{font-size:10px;letter-spacing:2px;font-weight:700;color:#52606d;text-transform:uppercase}.addr b{display:block;font-size:14px;color:#111;margin:4px 0 2px}
  h4{font-size:10px;letter-spacing:2px;margin:18px 0 8px;color:#333}
  table.items{width:100%;border-collapse:collapse;border-top:2px solid #111}table.items th{font-size:10px;letter-spacing:.5px;text-align:left;padding:9px 6px;border-bottom:2px solid #111;vertical-align:bottom;text-transform:uppercase}
  table.items td{padding:9px 6px;border-bottom:1px solid #d9dde3;vertical-align:top}table.items .n{text-align:right;white-space:nowrap}.items td.o{color:#52606d;vertical-align:middle}
  .box{border:1px solid #cbd2d9;border-radius:10px;margin:14px 0;overflow:hidden}.row{display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #e4e7eb}
  .row.grand{border-top:2px solid #111;border-bottom:none;font-weight:700;font-size:13px;padding:11px 14px}.row.vat{background:#fffbea;color:#92400e;font-weight:600}.row.bal{color:#dc2626;font-weight:700}
  .tc{border:1px solid #cbd2d9;border-radius:10px;margin:10px 38px;overflow:hidden}.tc .h{padding:11px 14px;border-bottom:1px solid #e4e7eb;font-size:10px;letter-spacing:2px;font-weight:700;text-transform:uppercase}
  .tc .b{padding:12px 16px;text-align:justify}.tc p{margin:0 0 5px}.tc h2{color:#2c4a7c;font-size:24px;margin:26px 0 6px}.tc h3{font-size:20px;margin:22px 0 6px;color:#222}.tc ul{margin:0 0 6px;padding-left:12px}.tc li{margin:0 0 4px}
  .foot{border-top:1px solid #d9dde3;margin-top:22px;padding-top:14px;text-align:center;color:#52606d}`;

function invoiceTotals(doc, vat) {
  const rows = [];
  const row = (label, value, cls = "") => rows.push(`<div class="row ${cls}"><span>${esc(label)}</span><span>${value}</span></div>`);
  row(vat ? "Subtotal (ex. VAT)" : "Subtotal", gbp(vat ? Math.round(doc.subtotalMinor / 1.2) : doc.subtotalMinor));
  if (doc.offerMinor) row("Offer Discount −", gbp(doc.offerMinor));
  if (doc.couponMinor) row(`Coupon (${doc.couponValue}) −`, gbp(doc.couponMinor));
  for (const d of doc.delivery) if (d.minor) row(`${d.label} +`, gbp(d.minor));
  for (const sv of doc.services) row(`${sv.label} +`, gbp(sv.minor));
  // The legacy VAT row: 20% included in the grand total (one sixth of it).
  if (vat) row("VAT (20%)", gbp(Math.round(doc.totalMinor / 6)), "vat");
  row(vat ? "Grand Total (inc. VAT)" : "Grand Total", gbp(doc.totalMinor), "grand");
  if (doc.paidMinor > 0) row("Paid", gbp(doc.paidMinor));
  if (doc.balanceMinor > 0) row("Balance Due", gbp(doc.balanceMinor), "bal");
  return `<div class="box">${rows.join("")}</div>`;
}

/** The Exc VAT and Inc VAT invoices (print-invoice.php, print-vat-invoice.php), as in the sample PDFs. */
export function invoiceHtml(doc, site, { vat }) {
  const word = vat ? "Tax Invoice" : "Invoice";
  const items = doc.lines
    .map(
      (l) =>
        `<tr><td><b style="font-weight:600">${esc(l.title)}</b></td><td class="o">${optionLines(l).map(esc).join("<br>")}</td><td>${esc(l.code)}</td><td><b>${esc(l.sku)}</b></td><td class="n">${l.qty}</td><td class="n">${gbp(l.unitMinor)}</td><td class="n">${gbp(l.totalMinor)}</td><td class="n">${gbp(l.offerMinor)}</td><td class="n">${l.couponMinor ? gbp(l.couponMinor) : "£0"}</td><td class="n"><b>${gbp(l.finalMinor)}</b></td></tr>`,
    )
    .join("");
  const address = (title, lines, phone) =>
    `<div><span class="lbl">${title}</span><b>${esc(lines[0] ?? "")}</b>${lines.slice(1).map(esc).join("<br>")}${phone ? `<br>Tel: ${esc(phone)}` : ""}</div>`;
  const addressLine = "Unit 1 15 Bakewell Road, Loughborough, United Kingdom, LE11 5QY"; // as printed on the legacy invoice
  return shell(
    `${word} #${num(doc)} — ${site.name}`,
    INVOICE_CSS,
    `<div class="inv">
    <div class="top"><div>${site.logoUrl ? `<img src="${esc(site.logoUrl)}" alt="${esc(site.name)}">` : ""}</div>
      <div class="r"><h1>INVOICE</h1>${vat ? '<span class="pill">VAT TAX INVOICE</span>' : ""}<div><b>Invoice #${esc(num(doc))}</b></div><div>Date: <b>${esc(dmyDate(doc.createdAt))}</b></div>${doc.orderStatus ? `<div>Status: <b>${esc(doc.orderStatus)}</b></div>` : ""}</div></div>
    <div class="from"><div><b>${esc(site.name)}</b><br><span class="muted">${esc(addressLine)}</span>${vat ? `<br><span class="muted">${esc(dashPhone(site.phone))}</span>` : ""}</div>
      ${vat ? `<div class="reg">REG. NO <b>${COMPANY.companyNo}</b><br>VAT NO <b>${COMPANY.vatNo}</b></div>` : `<div class="muted">Tel: ${esc(dashPhone(site.phone))}</div>`}</div>
    <div class="addr">${address("Billing Address", doc.billing, doc.billingPhone)}${address("Shipping Address", doc.shipping, doc.shippingPhone)}</div>
    <h4>ORDER ITEMS</h4>
    <table class="items"><tr><th>Item</th><th>Options</th><th>Code</th><th>SKU</th><th class="n">Qty</th><th class="n">Unit<br>Price</th><th class="n">Amount</th><th class="n">Offer<br>Disc.</th><th class="n">Coupon<br>Disc.</th><th class="n">Final<br>Price</th></tr>${items}</table>
    ${invoiceTotals(doc, vat)}
    ${showTerms(doc) ? `<div class="tc"><div class="h">Terms &amp; Conditions</div><div class="b">${TERMS_HTML}</div></div>` : ""}
    <div class="foot">${esc(site.name)}${vat ? ` — Reg. No: ${COMPANY.companyNo} — VAT No: ${COMPANY.vatNo}` : ""} — ${esc(dashPhone(site.phone))}${vat ? "" : " — Thank you for your order!"}</div></div>`,
  );
}

// ----- Save PDF (orderInvoice.php) -----
const PDF_CSS = `
  body{margin:0;font-family:"DejaVu Sans","Segoe UI",Verdana,Arial,sans-serif;color:#2b2420;font-size:11px;line-height:1.5}
  .pg{max-width:780px;margin:0 auto;border:1px solid #e8e2d8}
  .hd{background:#f9f7f3;padding:22px 28px 14px;border-bottom:2px solid #d9c9a8;display:flex;justify-content:space-between;align-items:flex-start}.hd img{max-height:56px;mix-blend-mode:multiply}
  .hd .r{text-align:right}.hd .r b{font-size:16px;color:#4d403a}.hd .r div{margin-top:6px;color:#4d403a}.hd small{color:#6b6259;font-size:9px}
  .tb{background:#f1ede7;padding:14px 28px;display:flex;justify-content:space-between;align-items:center}.tb h1{margin:0;font-size:20px;color:#4d403a}.tb small{color:#6b6259;font-size:9px}.tb .r{text-align:right;color:#6b6259}.tb .r b{font-size:12px;color:#2b2420}
  .two{display:flex;border:1px solid #e8e2d8;margin:14px 0 0}.two>div{flex:1;padding:12px 14px;background:#faf8f5;line-height:1.9}.two>div+div{border-left:1px solid #e8e2d8}
  .pillb{display:inline-block;background:#e8dfd0;color:#4d403a;font-size:9px;font-weight:700;letter-spacing:1.5px;padding:3px 10px;margin-bottom:6px;text-transform:uppercase}.two b.nm{display:block;font-size:12px}
  h4{font-size:10px;letter-spacing:2px;margin:18px 0 6px;color:#333;padding:0 0 0 2px}
  table.it{width:100%;border-collapse:collapse}table.it th{background:#4d403a;color:#fff;font-size:9px;letter-spacing:1px;padding:9px 8px;text-align:left;text-transform:uppercase}
  table.it td{padding:12px 8px;border-bottom:1px solid #e8e2d8;vertical-align:top}table.it .n{text-align:right;white-space:nowrap}table.it img{width:56px;height:56px;object-fit:cover;border:1px solid #e8e2d8}
  .tot{width:46%;margin:14px 0 0 auto;border:1px solid #e8e2d8}.tot div{display:flex;justify-content:space-between;padding:8px 12px;background:#f8f6f2;border-bottom:1px solid #e8e2d8}.tot .g{color:#2f6b4f}.tot .gt{background:#4d403a;color:#fff;font-weight:700;font-size:14px;border:none}
  .kv{display:flex;border:1px solid #e8e2d8;margin-top:6px}.kv>div{flex:1;padding:12px 14px;background:#faf8f5}.kv>div+div{border-left:1px solid #e8e2d8}.kv .row{display:flex;font-size:10px;padding:3px 0}.kv .row span:first-child{width:90px;color:#8a8279}.kv .row span:nth-child(2){width:14px;color:#8a8279}
  .ft{background:#f9f7f3;text-align:center;padding:12px;color:#6b6259;font-size:9px;margin-top:22px}.ft b{color:#4d403a}.pad{padding:0 28px}`;

const kvRows = (pairs) => pairs.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>:</span><span>${esc(v)}</span></div>`).join("");
const addressPairs = (a, phone, extra = []) => [
  ["Name", a.name], ["Address Line 1", a.address1], ["Address Line 2", a.address2], ["City", a.city], ["Postcode", a.zip], ["County", a.province], ["Country", a.country], ["Phone", phone], ...extra,
];

/** Save PDF (orderInvoice.php): the compact Tax Invoice with product pictures and delivery dates. */
export function savePdfHtml(doc, site) {
  const rows = doc.lines
    .map(
      (l) =>
        `<tr><td>${l.imageUrl ? `<img src="${esc(l.imageUrl)}" alt="">` : ""}</td><td><b>${esc(l.title)}</b>${optionLines(l)
          .map((o) => `<br><span style="font-size:10px"><b>${esc(o.split(" : ")[0])}</b> : ${esc(o.split(" : ").slice(1).join(" : "))}</span>`)
          .join("")}${l.expectedDate ? `<br><span style="font-size:9px;color:#8a8279">Delivery: ${esc(dmy(l.expectedDate))}</span>` : ""}</td><td class="n"><b>${gbp(l.unitMinor)}</b></td><td class="n"><b>${l.qty}</b></td><td class="n"><b>${gbp(l.totalMinor)}</b></td></tr>`,
    )
    .join("");
  const money = [`<div><span>Subtotal</span><b>${gbp(doc.subtotalMinor)}</b></div>`];
  if (doc.discountMinor) money.push(`<div class="g"><span>Offer Discount (-)</span><b>−${gbp(doc.discountMinor)}</b></div>`);
  for (const d of doc.delivery) if (d.minor) money.push(`<div><span>${esc(d.label)}</span><b>${gbp(d.minor)}</b></div>`);
  for (const sv of doc.services) money.push(`<div><span>${esc(sv.label)}</span><b>${gbp(sv.minor)}</b></div>`);
  money.push(`<div class="gt"><span>Grand Total</span><span>${gbp(doc.totalMinor)}</span></div>`);
  const ship = doc.shippingRaw ?? {};
  const bill = doc.billingRaw ?? ship;
  return shell(
    `Invoice ${num(doc)}`,
    PDF_CSS,
    `<div class="pg">
    <div class="hd"><div>${site.logoUrl ? `<img src="${esc(site.logoUrl)}" alt="${esc(site.name)}">` : ""}</div>
      <div class="r"><b>${esc(site.name)}</b><div><small>${esc(COMPANY.address)}</small></div><div><small>Tel: ${esc(site.phone)} &nbsp;•&nbsp; ${esc(site.email)}</small></div><div><small>Company No: ${COMPANY.companyNo} &nbsp;•&nbsp; VAT No: ${COMPANY.vatNo}</small></div></div></div>
    <div class="tb"><div><h1>Tax Invoice</h1><small>${esc(site.url)}</small></div><div class="r">Invoice No &nbsp;<b>${esc(num(doc))}</b><br>Date &nbsp;<b>${esc(longDate(doc.createdAt))}</b></div></div>
    <div class="pad"><div class="two"><div><span class="pillb">Bill To</span><b class="nm">${esc(doc.billing[0] ?? "")}</b>${doc.billing.slice(1).map(esc).join("<br>")}${doc.billingPhone ? `<br>Tel: ${esc(doc.billingPhone)}` : ""}</div>
      <div><span class="pillb">Shipping Address</span><b class="nm">${esc(doc.shipping[0] ?? "")}</b>${doc.shipping.slice(1).map(esc).join("<br>")}</div></div>
    <h4>ORDER ITEMS</h4>
    <table class="it"><tr><th>Image</th><th>Description</th><th class="n">Unit Price</th><th class="n">Qty</th><th class="n">Amount</th></tr>${rows}</table>
    <div class="tot">${money.join("")}</div>
    <h4>DELIVERY &amp; BILLING INFORMATION</h4>
    <div class="kv"><div><span class="pillb">Delivery Details</span>${kvRows(addressPairs(ship, doc.shippingPhone))}</div><div><span class="pillb">Billing Details</span>${kvRows(addressPairs(bill, doc.billingPhone, [["Mobile", ""], ["Email", doc.email]]))}</div></div></div>
    <div class="ft">Thank you for choosing <b>${esc(site.name)}</b> — We appreciate your business<br>${esc(site.url)} &nbsp;•&nbsp; Tel: ${esc(site.phone)} &nbsp;•&nbsp; ${esc(site.email)}</div></div>`,
  );
}

// ----- Delivery note (print-delivery-notes.php) -----
const NOTE_CSS = `
  body{margin:0;font-family:Verdana,"DejaVu Sans",Arial,sans-serif;color:#222;font-size:11px}
  .pg{max-width:760px;margin:0 auto;border:1px dotted #aaa;padding:14px 14px 40px}
  .hd{display:flex;justify-content:space-between;align-items:flex-start}.hd img{max-height:56px}.hd .co{font-weight:700;font-size:11px;line-height:1.3;margin-top:4px;max-width:300px}
  .hd h2{margin:30px 0 4px;font-size:18px;text-align:right}.dt{border:2px solid #333;border-collapse:collapse}.dt td{border:1px solid #333;padding:4px 6px;font-size:12px}
  .grid{display:flex;gap:4px;margin:34px 0 0}.grid>div{flex:1;border:2px solid #333;min-height:165px}.grid .t{padding:8px 10px;font-size:12px;border-bottom:1px solid #333}.grid .c{padding:6px 10px;font-size:11px}
  table.n{width:100%;border-collapse:collapse;border:2px solid #333;margin-top:48px}table.n th{border:1px solid #333;padding:8px;font-size:12px;font-weight:400}table.n td{border:1px solid #333;padding:6px 8px;vertical-align:top;font-size:11px}
  .sig{display:flex;justify-content:space-between;margin-top:14px;font-family:"Times New Roman",serif;font-size:14px;line-height:1.9}.sig>div:first-child{border-right:1px solid #333;padding-right:150px;flex:1}.sig .ty{text-align:right;font-weight:700;align-self:center}
  h3{font-size:12px;margin:18px 0 4px}table.d{width:100%;border-collapse:collapse}table.d th,table.d td{border:1px solid #333;padding:4px 8px;font-size:11px;text-align:left}`;

/** The delivery note, as in the sample: only lines in a printable status, delivered items listed apart. */
export function deliveryNoteHtml(doc, site) {
  const onNote = doc.lines.filter((l) => DELIVERY_NOTE_STATUS_IDS.includes(l.statusId));
  const delivered = doc.lines.filter((l) => l.statusId === DELIVERED_STATUS_ID);
  const rows = onNote
    .map(
      (l) =>
        `<tr><td>${esc(l.title)}<br><br>${optionLines(l).map(esc).join("<br>")}</td><td style="vertical-align:bottom">${esc(l.sku)}</td><td style="text-align:center">${l.qty}</td><td style="text-align:center">${esc(statusName(l.statusId))}<br><br>Boxes :</td></tr>`,
    )
    .join("");
  const done = delivered.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.title)}</td><td>${l.qty}</td><td></td></tr>`).join("");
  const phone = doc.shippingPhone;
  const invoiceDate = longDate(doc.createdAt).replace(/^(\d+) (\w+) (\d+)$/, "$2 $1, $3");
  return shell(
    `Details of Invoice# ${num(doc)}  [Invoice Date : ${invoiceDate}] ${site.name}`,
    NOTE_CSS,
    `<div class="pg">
    <div class="hd"><div>${site.logoUrl ? `<img src="${esc(site.logoUrl)}" alt="${esc(site.name)}">` : ""}<div class="co">${esc(site.name)}<br>${esc(COMPANY.address)}.<br>${esc(dashPhone(site.phone))}</div></div>
      <div><h2>Delivery Note</h2><table class="dt"><tr><td>Date</td><td>Invoice #</td></tr><tr><td>${esc(mdyDate(doc.createdAt))}</td><td>${esc(num(doc))}</td></tr></table></div></div>
    <div class="grid"><div><div class="t">Shipping Address</div><div class="c">${doc.shipping.map(esc).join("<br>")}${phone ? `<br><br>Phone : ${esc(phone)}` : ""}${doc.email ? `<br>Email : ${esc(doc.email)}` : ""}</div></div>
      <div><div class="t">Delivery Instruction</div><div class="c"><div style="font-size:13px">${esc(doc.deliveryMethod)}</div><p style="font-size:13px"><b>Assigned Container / Freestock Info :</b></p>${doc.note ? `<p>Customer Instruction : ${esc(doc.note)}</p>` : ""}${doc.instructions ? `<p>Other Instructions : ${esc(doc.instructions)}</p>` : ""}</div></div></div>
    <table class="n"><tr><th style="text-align:left">Item</th><th>Product Code</th><th>Quantity</th><th>Order Status</th></tr>${rows}</table>
    ${delivered.length ? `<h3>Already Delivered Items</h3><table class="d"><tr><th>S.No.</th><th>Item</th><th>Qty.</th><th>Date.</th></tr>${done}</table>` : ""}
    <div class="sig"><div>Signature :<br>Name &nbsp;&nbsp;&nbsp;&nbsp;: <b>${esc(doc.shipping[0] ?? "")}</b><br>Date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:<br>Time &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:<br><b>Total No.of Boxes :</b></div><div class="ty">Thank You<br>${esc(site.name)}</div></div></div>`,
  );
}

// ----- Labels -----
const LABEL_CSS = `body{font-family:"Segoe UI",Arial,sans-serif;color:#1f2933;font-size:13px;padding:0 24px}.label{border:2px solid #1f2933;padding:18px;max-width:520px;font-size:18px}.label b{font-size:22px}.muted{color:#52606d}
  h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #9aa5b1}table{border-collapse:collapse;max-width:520px;width:100%}th,td{border:1px solid #cbd2d9;padding:5px 7px;text-align:left}th{background:#f0f2f5}.n{text-align:right}`;

/** The shipping address label (print_label.php). */
export function labelHtml(doc) {
  return shell(
    `Order : ${doc.name}`,
    LABEL_CSS,
    `<div class="label"><div class="muted">Shipping Address</div><div>Order No: <b>${esc(doc.name)}</b></div><br>${doc.shipping.map((l) => `<b>${esc(l)}</b>`).join("<br>")}${doc.shippingPhone ? `<br><br>Tel: ${esc(doc.shippingPhone)}` : ""}</div>`,
  );
}

/** The return label (print_return_label.php): the ticked lines with their quantities, under the chosen type. */
export function returnLabelHtml(doc, lineIds, type) {
  const picked = doc.lines.filter((l) => lineIds.includes(l.id));
  const items = picked
    .map((l) => `<tr><td>${esc(l.title)}${optionLines(l).length ? `<br><span class="muted">${optionLines(l).map(esc).join("<br>")}</span>` : ""}</td><td>${esc(l.sku)}</td><td class="n">${l.qty}</td></tr>`)
    .join("");
  return shell(
    `Return Label : ${doc.name}`,
    LABEL_CSS,
    `<div class="label"><div class="muted">Return Label - ${esc(RETURN_TYPES[type] ?? type)}</div><div>Order No: <b>${esc(doc.name)}</b></div><br>${doc.shipping.map((l) => `<b>${esc(l)}</b>`).join("<br>")}</div>
    <h2>Items</h2><table><tr><th>Item</th><th>SKU</th><th class="n">Qty</th></tr>${items}</table>`,
  );
}
