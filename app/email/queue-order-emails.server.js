// Turns an email request into queued outbox rows: picks the template and site, renders, and writes the rows.
import { enqueueEmails } from "./outbox.server";
import { renderEmail } from "./render.server";
import { planStatusEmails } from "./rules.server";
import { ensureSeeded } from "./seed/index.server";
import { DEFAULT_SITE_CODE } from "./seed/sites";

// These go out from the deliveries address; everything else from customer service.
const DELIVERY_KEYS = new Set(["delivery.prebooked", "delivery.rescheduled", "delivery.booking_confirmation", "tracking"]);

const optionsOf = (line) => {
  const props = (Array.isArray(line.properties) ? line.properties : []).filter((p) => p?.key && !String(p.key).startsWith("_"));
  if (props.length) return props.map((p) => `${p.key}: ${p.value}`).join(", ");
  return line.variantTitle && line.variantTitle !== "Default Title" ? line.variantTitle : "";
};

export const lineData = (line, extra = {}) => ({
  name: line.title,
  options: optionsOf(line),
  qty: line.quantity,
  expectedDate: extra.expectedDate ?? "",
  deliveryDate: extra.deliveryDate ?? "",
  slot: extra.slot ?? "",
  drop: extra.drop ?? "",
  note: extra.note ?? "",
});

/** @returns {Promise<{ok:true,rows:object[],duplicate:boolean}|{ok:false,code:string}>} */
export async function queueOrderEmails(db, { shop, orderId, request, actor, config, now = new Date() }) {
  if (!config.enabled) return { ok: false, code: "email_off" };
  await ensureSeeded(db, shop);

  const order = await db.order.findUnique({ where: { shop_orderId: { shop, orderId } } });
  if (!order) return { ok: false, code: "no_order" };

  const plans =
    request.statusId !== undefined
      ? planStatusEmails({ statusId: request.statusId, lineIds: request.lineIds, previousStatusByLine: request.previousStatusByLine, collectionLineIds: request.collectionLineIds })
      : [{ key: request.templateKey, lineIds: request.lineIds }];
  if (plans.length === 0) return { ok: false, code: "nothing_to_send" };

  const [layout, orderLines, siteRow, defaultSite] = await Promise.all([
    db.emailTemplate.findUnique({ where: { shop_key: { shop, key: "layout" } } }),
    db.orderLine.findMany({ where: { shop, orderId } }),
    db.emailSite.findUnique({ where: { shop_code: { shop, code: order.site ?? DEFAULT_SITE_CODE } } }),
    db.emailSite.findUnique({ where: { shop_code: { shop, code: DEFAULT_SITE_CODE } } }),
  ]);
  const site = siteRow ?? defaultSite;
  const extras = request.extras ?? {};
  const drafts = [];

  for (const [unit, plan] of plans.entries()) {
    const template = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key: plan.key } } });
    if (!template) return { ok: false, code: "unknown_template" };

    const lines = plan.lineIds.map((id) => orderLines.find((l) => l.lineId === id)).filter(Boolean);
    const { subject, html } = renderEmail({
      template,
      layout,
      site,
      now,
      data: {
        customerName: order.customerName,
        customerEmail: order.email,
        orderNumber: order.name,
        staffName: actor.name,
        manufacturer: lines[0]?.vendor ?? "",
        ...extras,
        lines: lines.map((l) => lineData(l, request.lineExtras?.[l.lineId])),
      },
    });

    const delivery = DELIVERY_KEYS.has(plan.key);
    const base = {
      shop,
      orderId,
      orderName: order.name,
      templateKey: plan.key,
      templateVersion: template.version,
      from: `${delivery ? site.deliveriesFromName : site.fromName} <${config.fromAddress}>`,
      replyTo: delivery ? site.deliveriesEmail : site.serviceEmail,
      html,
      actorId: actor.id,
      actorName: actor.name,
    };
    const recipient = order.email?.trim();
    drafts.push({
      ...base,
      kind: "customer",
      recipient: recipient || null,
      subject,
      ...(recipient ? { status: "queued" } : { status: "skipped", error: "no_recipient" }),
      dedupeKey: `${request.idempotencyKey}:${unit}:customer`,
    });
    if (config.internalCopyTo) {
      drafts.push({ ...base, kind: "internal_copy", status: "queued", recipient: config.internalCopyTo, subject: `${subject} : ${actor.name}`, dedupeKey: `${request.idempotencyKey}:${unit}:internal_copy` });
    }
  }

  const { rows, duplicate } = await enqueueEmails(db, drafts);
  return { ok: true, rows, duplicate };
}
