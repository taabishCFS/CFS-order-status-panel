// Send Bulk Email (Orders by Brand): one email per customer address for the selected lines, using the
// bulk.customer template. Staff edit the subject and message; {{customer_name}} and {{order_numbers}} are filled per customer.
import { enqueueEmails } from "./outbox.server";
import { renderEmail, validateTemplate } from "./render.server";
import { ensureSeeded } from "./seed/index.server";
import { DEFAULT_SITE_CODE } from "./seed/sites";

const TEMPLATE_KEY = "bulk.customer";
const DEFAULT_SUBJECT = "Update on your order {{order_numbers}}";
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const MAX_LINES = 500;
const bad = { error: "bad_request" };

/** Reads the JSON a browser sends. Returns { value } or { error }. */
export function readBulkRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad;
  const { lineIds, subject, message, idempotencyKey, dryRun } = body;
  if (!Array.isArray(lineIds) || lineIds.length < 1 || lineIds.length > MAX_LINES || !lineIds.every((id) => typeof id === "string" && LINE_ID.test(id))) return bad;
  if (typeof message !== "string" || !message.trim() || message.length > 5000) return bad;
  if (subject !== undefined && (typeof subject !== "string" || subject.length > 200)) return bad;
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 1 || idempotencyKey.length > 80) return bad;
  if (dryRun !== undefined && typeof dryRun !== "boolean") return bad;
  return { value: { lineIds, subject: subject?.trim() || DEFAULT_SUBJECT, message: message.trim(), idempotencyKey, dryRun: dryRun === true } };
}

const fillTokens = (text, name, orderNumbers) =>
  text.replace(/\{\{\s*customer_name\s*\}\}/g, () => name).replace(/\{\{\s*order_numbers\s*\}\}/g, () => orderNumbers);

// Groups the selected orders by email address (ignoring case and spaces), in the order they were found.
function groupByCustomer(lines, orders) {
  const orderById = new Map(orders.map((o) => [o.orderId, o]));
  const seenOrders = [];
  for (const line of lines) {
    if (!seenOrders.includes(line.orderId) && orderById.has(line.orderId)) seenOrders.push(line.orderId);
  }
  const customers = new Map();
  let withoutEmail = 0;
  for (const orderId of seenOrders) {
    const order = orderById.get(orderId);
    const email = order.email?.trim().toLowerCase();
    if (!email) { withoutEmail += 1; continue; }
    if (!customers.has(email)) customers.set(email, { email, name: order.customerName?.trim() || "Customer", site: order.site, orders: [] });
    customers.get(email).orders.push(order);
  }
  return { customers: [...customers.values()], withoutEmail };
}

/**
 * @returns {Promise<{ok:true,customers:number,orders:number,withoutEmail:number,recipients?:object[],rows?:object[],duplicate?:boolean}
 *   |{ok:false,code:string,errors?:string[],withoutEmail?:number}>}
 */
export async function queueBulkEmails(db, { shop, request, actor, config, dryRun = request.dryRun === true, now = new Date() }) {
  if (!config.enabled) return { ok: false, code: "email_off" };
  await ensureSeeded(db, shop);

  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: request.lineIds } } });
  if (lines.length === 0) return { ok: false, code: "no_lines" };
  const orders = await db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } } });
  const { customers, withoutEmail } = groupByCustomer(lines, orders);
  if (customers.length === 0) return { ok: false, code: "no_recipients", withoutEmail };

  const template = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key: TEMPLATE_KEY } } });
  if (!template) return { ok: false, code: "unknown_template" };
  const subjectTemplate = `${request.subject} : {{site_name}}`;
  const check = validateTemplate({ key: TEMPLATE_KEY, subject: subjectTemplate, body: template.body });
  if (!check.ok) return { ok: false, code: "bad_subject", errors: check.errors };

  const summary = { ok: true, customers: customers.length, orders: customers.reduce((n, c) => n + c.orders.length, 0), withoutEmail };
  if (dryRun) return { ...summary, recipients: customers.map((c) => ({ email: c.email, name: c.name, orders: c.orders.map((o) => o.name) })) };

  const [layout, defaultSite] = await Promise.all([
    db.emailTemplate.findUnique({ where: { shop_key: { shop, key: "layout" } } }),
    db.emailSite.findUnique({ where: { shop_code: { shop, code: DEFAULT_SITE_CODE } } }),
  ]);
  const drafts = [];
  for (const customer of customers) {
    const site = (await db.emailSite.findUnique({ where: { shop_code: { shop, code: customer.site ?? DEFAULT_SITE_CODE } } })) ?? defaultSite;
    const orderNumbers = customer.orders.map((o) => o.name).join(", ");
    const { subject, html } = renderEmail({
      template: { ...template, subject: fillTokens(subjectTemplate, customer.name, orderNumbers) },
      layout,
      site,
      now,
      data: {
        customerName: customer.name,
        customerEmail: customer.email,
        orderNumber: customer.orders[0].name,
        orderNumbers,
        staffName: actor.name,
        message: fillTokens(request.message, customer.name, orderNumbers),
        lines: [],
      },
    });
    const first = customer.orders[0];
    const base = {
      shop, templateKey: TEMPLATE_KEY, templateVersion: template.version,
      from: `${site.fromName} <${config.fromAddress}>`, replyTo: site.serviceEmail, html, actorId: actor.id, actorName: actor.name,
    };
    const key = `${request.idempotencyKey}:bulk:${customer.email}`;
    drafts.push({ ...base, orderId: first.orderId, orderName: customer.orders.map((o) => o.name).join(", "), kind: "customer", recipient: customer.email, subject, status: "queued", dedupeKey: `${key}:customer` });
    for (const other of customer.orders.slice(1)) {
      // So each order's own history shows that this customer was told, without sending the email again.
      drafts.push({ ...base, orderId: other.orderId, orderName: other.name, kind: "customer", recipient: customer.email, subject, status: "skipped", error: "included_in_bulk", dedupeKey: `${key}:ref:${other.orderId}` });
    }
    if (config.internalCopyTo) {
      drafts.push({ ...base, orderId: first.orderId, orderName: customer.orders.map((o) => o.name).join(", "), kind: "internal_copy", recipient: config.internalCopyTo, subject: `${subject} : ${actor.name}`, status: "queued", dedupeKey: `${key}:internal_copy` });
    }
  }
  const { rows, duplicate } = await enqueueEmails(db, drafts);
  return { ...summary, rows, duplicate };
}
