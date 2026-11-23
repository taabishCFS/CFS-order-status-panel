// Queues the Resend Inv. email in the outbox. The email worker sends it (and it shows in the order's email log).
import { enqueueEmails } from "../email/outbox.server";
import { invoiceEmailHtml, invoiceEmailSubject } from "./invoice-email";

/** { ok: true, row, duplicate } or { ok: false, code }: email_off | no_recipient. */
export async function queueInvoiceEmail(db, { shop, orderId, doc, site, staff, config, idempotencyKey }) {
  if (!config.enabled) return { ok: false, code: "email_off" };
  const recipient = doc.email?.trim();
  if (!recipient) return { ok: false, code: "no_recipient" };
  const draft = {
    shop,
    orderId,
    orderName: doc.name,
    templateKey: "invoice.resend",
    templateVersion: 0, // not a stored template yet: placeholder wording
    kind: "customer",
    recipient,
    from: `${site.name} <${config.fromAddress}>`,
    replyTo: site.email,
    subject: invoiceEmailSubject(doc, site),
    html: invoiceEmailHtml(doc, site),
    status: "queued",
    actorId: staff.id,
    actorName: staff.name,
    dedupeKey: `${idempotencyKey}:invoice:customer`,
  };
  const { rows, duplicate } = await enqueueEmails(db, [draft]);
  return { ok: true, row: rows[0], duplicate };
}
