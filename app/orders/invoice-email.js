// Resend Inv.: the invoice emailed to the customer. PLACEHOLDER wording and layout until staff confirm the sender, the text and
// whether to attach the invoice or link to it (staff question Q30). The email carries the order summary itself, so it needs no
// link or attachment. Pure functions; the queueing is in invoice-email.server.js.
import { esc, gbp } from "./documents.js";

const num = (doc) => String(doc.name).replace(/^#/, "");

export const invoiceEmailSubject = (doc, site) => `Your invoice for order ${doc.name} - ${site.name}`;

export function invoiceEmailHtml(doc, site) {
  const rows = doc.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e4e7eb">${esc(l.title)}${l.variantTitle ? `<br><span style="color:#52606d">${esc(l.variantTitle)}</span>` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #e4e7eb;text-align:center">${l.qty}</td><td style="padding:6px 8px;border-bottom:1px solid #e4e7eb;text-align:right">${gbp(l.finalMinor)}</td></tr>`,
    )
    .join("");
  const total = (label, value, bold = false) =>
    `<tr><td colspan="2" style="padding:4px 8px;text-align:right;${bold ? "font-weight:700" : ""}">${esc(label)}</td><td style="padding:4px 8px;text-align:right;${bold ? "font-weight:700" : ""}">${value}</td></tr>`;
  const extra = [
    ...doc.delivery.filter((d) => d.minor).map((d) => total(d.label, gbp(d.minor))),
    ...doc.services.map((s) => total(s.label, gbp(s.minor))),
  ].join("");
  return `<div style="font-family:Arial,sans-serif;color:#1f2933;font-size:14px;max-width:620px;margin:0 auto">
    <p>Hello ${esc(doc.shipping[0] ?? "")},</p>
    <p>Here is the invoice for your order <b>${esc(num(doc))}</b>, placed on ${esc(new Date(doc.createdAt).toLocaleDateString("en-GB", { timeZone: "UTC" }))}.</p>
    <table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #111">Item</th><th style="padding:6px 8px;border-bottom:2px solid #111">Qty</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111">Price</th></tr>${rows}
    ${total("Subtotal", gbp(doc.subtotalMinor))}${doc.discountMinor ? total("Discount", `−${gbp(doc.discountMinor)}`) : ""}${extra}${total("Total", gbp(doc.totalMinor), true)}${doc.paidMinor > 0 ? total("Paid", gbp(doc.paidMinor)) : ""}${doc.balanceMinor > 0 ? total("Balance due", gbp(doc.balanceMinor), true) : ""}</table>
    <p>If you have any questions, reply to this email or call ${esc(site.phone)}.</p>
    <p>Thank you for your order,<br>${esc(site.name)}</p></div>`;
}
