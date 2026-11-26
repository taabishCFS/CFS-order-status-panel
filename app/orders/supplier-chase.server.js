// Ordering from and chasing suppliers: the Supplier Chaseup and Date Lapsed lists, supplier contacts, and the Process Order / chase-up emails.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";
import { enqueueEmails } from "../email/outbox.server.js";
import { lineData } from "../email/queue-order-emails.server.js";
import { renderEmail } from "../email/render.server.js";
import { ensureSeeded } from "../email/seed/index.server.js";
import { DEFAULT_SITE_CODE } from "../email/seed/sites.js";
import { buildCsv } from "./export-rules.js";
import { MAX_ALL, NOT_ORDERABLE_STATUSES, PAGE_SIZE, buildChaseWhere, planSupplierEmails, splitEmails } from "./supplier-chase-rules.js";

const statusLabels = new Map(statuses.map((x) => [x.id, x.label]));
const brandOf = (vendor) => vendor?.trim() || "Unmapped";

/** One page of the Supplier Chaseup or Date Lapsed list: { rows, summary: { lines, orders }, total, page, pageCount, capped }. */
export async function listChase(db, shop, params, now = new Date()) {
  const where = buildChaseWhere(shop, params, now);
  const grouped = await db.orderLine.groupBy({ by: ["orderId"], where, _count: { _all: true } });
  const summary = { lines: grouped.reduce((n, g) => n + g._count._all, 0), orders: grouped.length };
  const size = params.all ? MAX_ALL : PAGE_SIZE;
  const pageCount = params.all ? 1 : Math.max(1, Math.ceil(summary.lines / size));
  const page = params.all ? 1 : Math.min(params.page, pageCount);
  const stored = await db.orderLine.findMany({ where, orderBy: [{ expectedDate: "asc" }, { orderCreatedAt: "asc" }, { lineId: "asc" }], skip: (page - 1) * size, take: size });
  const orderIds = [...new Set(stored.map((l) => l.orderId))];
  const orders = orderIds.length ? await db.order.findMany({ where: { shop, orderId: { in: orderIds } }, select: { orderId: true, name: true } }) : [];
  const names = new Map(orders.map((o) => [o.orderId, o.name]));
  const chases = stored.length ? await db.lineChase.findMany({ where: { shop, lineId: { in: stored.map((l) => l.lineId) } } }) : [];
  const chased = new Map(chases.map((c) => [c.lineId, c.lastChasedAt]));
  const rows = stored.map((l) => ({
    lineId: l.lineId,
    orderId: l.orderId,
    orderName: names.get(l.orderId) ?? "",
    orderCreatedAt: l.orderCreatedAt,
    brand: brandOf(l.vendor),
    product: l.title,
    variantTitle: l.variantTitle,
    quantity: l.quantity,
    lineStatusId: l.lineStatusId,
    expectedDate: l.expectedDate,
    deliveryOutcome: l.deliveryOutcome,
    lastChasedAt: chased.get(l.lineId)?.toISOString?.() ?? null,
  }));
  return { rows, summary, total: summary.lines, page, pageCount, capped: params.all && summary.lines > MAX_ALL };
}

/** Every brand seen on an order line or saved as a supplier, with its contact details. */
export async function listSuppliers(db, shop) {
  const [vendors, saved] = await Promise.all([db.orderLine.findMany({ where: { shop }, distinct: ["vendor"], select: { vendor: true } }), db.supplierContact.findMany({ where: { shop } })]);
  const byBrand = new Map(saved.map((s) => [s.brand, s]));
  const brands = [...new Set([...vendors.map((v) => brandOf(v.vendor)), ...saved.map((s) => s.brand)])].sort((a, b) => a.localeCompare(b));
  return brands.map((brand) => {
    const s = byBrand.get(brand);
    return { brand, email: s?.email ?? "", cc: s?.cc ?? "", handOrdered: Boolean(s?.handOrdered), address: s?.address ?? "" };
  });
}

/** Saves one brand's supplier details. */
export async function saveSupplier(db, shop, input, actor) {
  const data = { email: input.email || null, cc: input.cc || null, handOrdered: input.handOrdered, address: input.address || null, updatedBy: actor?.name ?? null };
  await db.supplierContact.upsert({ where: { shop_brand: { shop, brand: input.brand } }, create: { shop, brand: input.brand, ...data }, update: data });
  return { ok: true };
}

async function loadLines(db, shop, request) {
  if (request.lineIds) return db.orderLine.findMany({ where: { shop, lineId: { in: request.lineIds } } });
  const lines = await db.orderLine.findMany({ where: { shop, orderId: { in: request.orderIds } } });
  return lines.filter((l) => !NOT_ORDERABLE_STATUSES.includes(l.lineStatusId));
}

/**
 * Process Order ("order") or chase-up ("chaseup") for the chosen lines: queues the supplier emails.
 * Returns { ok:true, emails, orders, handOrdered, noSupplier, skipped, processedLines: [{ lineId, orderId }] } where `processedLines` are the lines
 * that were emailed (and, for Process Order, the hand-ordered ones): the page then sets those to Order in Progress.
 * Or { ok:false, code }.
 */
export async function queueSupplierEmails(db, { shop, request, actor, config, now = new Date() }) {
  if (!config.enabled) return { ok: false, code: "email_off" };
  const lines = await loadLines(db, shop, request);
  if (lines.length === 0) return { ok: false, code: "no_lines" };

  const brands = [...new Set(lines.map((l) => brandOf(l.vendor)))];
  const saved = await db.supplierContact.findMany({ where: { shop, brand: { in: brands } } });
  const contacts = new Map(saved.map((s) => [s.brand, { email: s.email, cc: s.cc, handOrdered: s.handOrdered }]));
  const plan = planSupplierEmails({ action: request.action, lines, contacts });
  const emailedLineIds = [...plan.emails.values()].flatMap((e) => e.lines.map((l) => l.lineId));
  const summary = {
    ok: true,
    emails: plan.emails.size,
    orders: new Set([...plan.emails.values()].flatMap((e) => e.lines.map((l) => l.orderId))).size,
    handOrdered: plan.handOrdered.length,
    noSupplier: plan.noSupplier,
    skipped: plan.skipped.length,
    processedLines: (request.action === "order" ? [...emailedLineIds, ...plan.handOrdered] : emailedLineIds).map((lineId) => ({ lineId, orderId: lines.find((l) => l.lineId === lineId).orderId })),
  };
  if (request.dryRun || plan.emails.size === 0) return { ...summary, rows: [] };

  await ensureSeeded(db, shop);
  const key = request.action === "order" ? "supplier.order_form" : "supplier.chaseup";
  const template = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key } } });
  if (!template) return { ok: false, code: "unknown_template" };
  const [layout, defaultSite] = await Promise.all([
    db.emailTemplate.findUnique({ where: { shop_key: { shop, key: "layout" } } }),
    db.emailSite.findUnique({ where: { shop_code: { shop, code: DEFAULT_SITE_CODE } } }),
  ]);
  const orders = await db.order.findMany({ where: { shop, orderId: { in: [...new Set(lines.map((l) => l.orderId))] } } });
  const orderById = new Map(orders.map((o) => [o.orderId, o]));

  const drafts = [];
  let unit = 0;
  for (const email of plan.emails.values()) {
    const first = orderById.get(email.lines[0].orderId);
    const site = request.action === "order" ? ((await db.emailSite.findUnique({ where: { shop_code: { shop, code: first?.site ?? DEFAULT_SITE_CODE } } })) ?? defaultSite) : defaultSite;
    const orderNames = [...new Set(email.lines.map((l) => orderById.get(l.orderId)?.name).filter(Boolean))];
    const { subject, html } = renderEmail({
      template,
      layout,
      site,
      now,
      data: {
        customerName: "",
        customerEmail: "",
        orderNumber: orderNames.join(", "),
        staffName: actor.name,
        manufacturer: email.brand,
        lines: email.lines.map((l) => lineData(request.action === "chaseup" ? { ...l, title: `${orderById.get(l.orderId)?.name ?? ""} ${l.title}`.trim() } : l)),
      },
    });
    const contact = contacts.get(email.brand);
    const base = {
      shop, orderId: email.lines[0].orderId, orderName: orderNames.join(", "), templateKey: key, templateVersion: template.version,
      from: `${site.fromName} <${config.fromAddress}>`, replyTo: site.serviceEmail, html, actorId: actor.id, actorName: actor.name, subject,
    };
    const addresses = [...splitEmails(contact.email), ...splitEmails(contact.cc)];
    for (const to of [...new Set(addresses)]) {
      drafts.push({ ...base, kind: "supplier", recipient: to, status: "queued", dedupeKey: `${request.idempotencyKey}:${unit}:${to}` });
    }
    if (config.internalCopyTo) {
      drafts.push({ ...base, kind: "internal_copy", recipient: config.internalCopyTo, status: "queued", subject: `${subject} : ${actor.name}`, dedupeKey: `${request.idempotencyKey}:${unit}:internal_copy` });
    }
    unit += 1;
  }
  const { rows, duplicate } = await enqueueEmails(db, drafts);

  if (request.action === "chaseup" && !duplicate) {
    for (const lineId of emailedLineIds) {
      const line = lines.find((l) => l.lineId === lineId);
      const data = { orderId: line.orderId, lastChasedAt: now, chasedByName: actor.name };
      await db.lineChase.upsert({ where: { shop_lineId: { shop, lineId } }, create: { shop, lineId, ...data }, update: data });
    }
  }
  return { ...summary, rows, duplicate };
}

const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const ukDate = (d) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "");
const CHASE_HEADERS = ["Order No", "Brand", "Product Name", "Qty", "Order Date", "Expected Delivery Date", "Last Chaseup Date", "Order Status"];
const LAPSED_HEADERS = ["Order No", "Brand", "Product Name", "Qty", "Order Date", "Expected Delivery Date", "Order Status"];

/** The CSV of the Supplier Chaseup or Date Lapsed list (every matching line, up to 5,000): { csv, count, capped }. */
export async function buildChaseCsv(db, shop, params, now = new Date()) {
  const list = await listChase(db, shop, { ...params, all: true }, now);
  const rows = list.rows.map((r) => {
    const status = statusLabels.get(r.lineStatusId) ?? "";
    const base = [r.orderName, r.brand, r.product, r.quantity, ukDate(r.orderCreatedAt), dmy(r.expectedDate)];
    return params.kind === "lapsed" ? [...base, status] : [...base, ukDate(r.lastChasedAt), status];
  });
  return { csv: buildCsv(params.kind === "lapsed" ? LAPSED_HEADERS : CHASE_HEADERS, rows), count: rows.length, capped: list.capped };
}
