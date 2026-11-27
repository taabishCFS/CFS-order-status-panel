// Create Payment Batch & Draft Email (legacy accountsPayToSupplier_batchAction.php, on Pay To Supplier).
// Staff tick lines of ONE brand and give the supplier's invoice number. "draft" shows the email for review and changes nothing;
// "send" stamps the invoice number on the lines (the Batch Invoice No. on Supplier Paid) and emails the supplier a payment advice.
// Marking the lines paid stays a separate step (Mark Paid), as in the old app.
import { enqueueEmails } from "../email/outbox.server.js";
import { renderEmail } from "../email/render.server.js";
import { ensureSeeded } from "../email/seed/index.server.js";
import { DEFAULT_SITE_CODE } from "../email/seed/sites.js";
import { payRowsFor } from "./pay-supplier.server.js";
import { splitEmails } from "./supplier-chase-rules.js";

export const TEMPLATE_KEY = "supplier.payment_advice";
export const MAX_BATCH_LINES = 500;
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const INVOICE_NO = /^[A-Za-z0-9][A-Za-z0-9\-_/.]{0,59}$/;

/** The invoice number suggested for a new batch, like the old CFSINV<brand>-<date and time>; our brands have no number, so it is left out. */
export function suggestInvoiceNo(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `CFSINV-${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

/** Reads { op: "draft" | "send", lineIds, invoiceNo, idempotencyKey (send only) }. */
export function readBatchInput(body) {
  if (!body || typeof body !== "object" || (body.op !== "draft" && body.op !== "send")) return { error: "bad_request" };
  const lineIds = Array.isArray(body.lineIds) ? [...new Set(body.lineIds.filter((x) => typeof x === "string" && LINE_ID.test(x)))] : [];
  if (lineIds.length === 0) return { error: "no_lines", message: "Please select at least one order line to include in this batch." };
  if (lineIds.length > MAX_BATCH_LINES) return { error: "bad_request" };
  const invoiceNo = typeof body.invoiceNo === "string" ? body.invoiceNo.trim() : "";
  if (!invoiceNo) return { error: "invoice_required", message: "Please enter the supplier invoice number for this batch." };
  if (!INVOICE_NO.test(invoiceNo)) return { error: "bad_invoice", message: "The invoice number can only use letters, numbers and - _ / . (up to 60 characters)." };
  const value = { op: body.op, lineIds, invoiceNo };
  if (body.op === "send") {
    if (typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(body.idempotencyKey)) return { error: "bad_request" };
    value.idempotencyKey = body.idempotencyKey;
  }
  return { value };
}

const MESSAGES = {
  no_lines: "Could not find the selected order lines. Press Refresh and try again.",
  one_brand: "Please select order lines from a single brand/supplier only - one email goes to one supplier.",
  no_email: (brand) => `There is no email address for ${brand}. Add it on the Suppliers page first.`,
  no_cost: (names) => `There is no cost for ${names}. Type a manual cost first, so the email shows what we are paying.`,
};

/** What the batch would be: { ok: true, brand, recipients, lines, totalMinor, invoiceNo } or { ok: false, code, message }. Changes nothing. */
export async function buildBatch(db, graphql, shop, { lineIds, invoiceNo }) {
  const rows = await payRowsFor(db, graphql, shop, lineIds);
  if (rows.length !== lineIds.length) return { ok: false, code: "no_lines", message: MESSAGES.no_lines };
  const brands = [...new Set(rows.map((r) => r.brand.trim()))];
  if (brands.length > 1) return { ok: false, code: "one_brand", message: MESSAGES.one_brand };
  const brand = brands[0];
  // As the old app: the manual cost when there is one, otherwise the cost worked out from Shopify (no DHD).
  const lines = rows.map((r) => ({ lineId: r.lineId, orderId: r.orderId, orderName: r.orderName, title: r.title, variantTitle: r.variantTitle, quantity: r.quantity, costMinor: r.manualMinor ?? r.calculatedMinor }));
  const missing = lines.filter((l) => l.costMinor == null);
  if (missing.length) return { ok: false, code: "no_cost", message: MESSAGES.no_cost(missing.map((l) => `${l.orderName} ${l.title}`).join(", ")) };
  const contact = await db.supplierContact.findFirst({ where: { shop, brand } });
  const recipients = [...new Set([...splitEmails(contact?.email), ...splitEmails(contact?.cc)])];
  if (recipients.length === 0) return { ok: false, code: "no_email", message: MESSAGES.no_email(brand) };
  return { ok: true, brand, recipients, lines, totalMinor: lines.reduce((s, l) => s + l.costMinor, 0), invoiceNo };
}

const gbp = (minor) => `£${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Stamps the invoice number on the lines and queues the payment advice to the supplier (and the internal copy). */
export async function sendBatch(db, { shop, graphql, request, actor, config, now = new Date() }) {
  if (!config.enabled) return { ok: false, code: "email_off", message: "Email is switched off, so nothing was changed." };
  const batch = await buildBatch(db, graphql, shop, request);
  if (!batch.ok) return batch;

  await ensureSeeded(db, shop);
  const [template, layout, site] = await Promise.all([
    db.emailTemplate.findUnique({ where: { shop_key: { shop, key: TEMPLATE_KEY } } }),
    db.emailTemplate.findUnique({ where: { shop_key: { shop, key: "layout" } } }),
    db.emailSite.findUnique({ where: { shop_code: { shop, code: DEFAULT_SITE_CODE } } }),
  ]);
  if (!template || !layout || !site) return { ok: false, code: "unknown_template", message: "The payment advice email template is missing." };

  for (const l of batch.lines) {
    await db.linePayment.upsert({
      where: { shop_lineId: { shop, lineId: l.lineId } },
      create: { shop, orderId: l.orderId, lineId: l.lineId, batchInvoiceNo: batch.invoiceNo, updatedByName: actor?.name ?? null },
      update: { batchInvoiceNo: batch.invoiceNo, updatedByName: actor?.name ?? null },
    });
  }

  const orderNames = [...new Set(batch.lines.map((l) => l.orderName))];
  const { subject, html } = renderEmail({
    template, layout, site, now,
    data: {
      customerName: "", customerEmail: "", orderNumber: orderNames.join(", "), staffName: actor.name, manufacturer: batch.brand,
      invoiceNumber: batch.invoiceNo, totalAmount: gbp(batch.totalMinor),
      lines: batch.lines.map((l) => ({ name: l.title, options: l.variantTitle, qty: l.quantity, orderNumber: l.orderName, cost: gbp(l.costMinor) })),
    },
  });
  const base = {
    shop, orderId: batch.lines[0].orderId, orderName: orderNames.join(", "), templateKey: TEMPLATE_KEY, templateVersion: template.version,
    from: `${site.fromName} <${config.fromAddress}>`, replyTo: site.serviceEmail, html, actorId: actor.id, actorName: actor.name, subject, status: "queued",
  };
  const drafts = batch.recipients.map((to) => ({ ...base, kind: "supplier", recipient: to, dedupeKey: `${request.idempotencyKey}:batch:${to}` }));
  if (config.internalCopyTo) drafts.push({ ...base, kind: "internal_copy", recipient: config.internalCopyTo, subject: `${subject} : ${actor.name}`, dedupeKey: `${request.idempotencyKey}:batch:internal_copy` });
  const { rows, duplicate } = await enqueueEmails(db, drafts);
  // In test mode the sender skips addresses that are not on the allowed test list; say so instead of claiming the email went.
  const blocked = config.mode === "test" ? batch.recipients.filter((to) => !(config.allowlist ?? []).includes(to.toLowerCase())) : [];
  return { ok: true, brand: batch.brand, recipients: batch.recipients, blocked, mode: config.mode ?? null, lines: batch.lines.length, totalMinor: batch.totalMinor, invoiceNo: batch.invoiceNo, queued: rows.length, duplicate };
}
