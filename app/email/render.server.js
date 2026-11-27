// Checks and renders email templates: {{placeholders}} and one repeating {{#lines}}...{{/lines}} block.
// Values are HTML-escaped; text a person typed is never read as a placeholder.
import { LINES_BLOCK, PLACEHOLDERS } from "./placeholders";

const MAX_BODY = 100 * 1024;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ANY_TAG = /\{\{([^{}]*)\}\}/g;
const PARSED_TAG = /^\s*([#/]?)\s*([A-Za-z0-9_]+)\s*$/;
const FILL = /\{\{\s*([a-z_]+)\s*\}\}/g;
const SPLIT_LOOP = new RegExp(`(\\{\\{#${LINES_BLOCK}\\}\\}[\\s\\S]*?\\{\\{/${LINES_BLOCK}\\}\\})`);
const LOOP_INNER = new RegExp(`^\\{\\{#${LINES_BLOCK}\\}\\}([\\s\\S]*)\\{\\{/${LINES_BLOCK}\\}\\}$`);

/** @returns {{ ok: true } | { ok: false, errors: string[] }} */
export function validateTemplate({ key, subject, body }) {
  const errors = [];
  const isLayout = key === "layout";
  if (typeof body !== "string" || !body.trim()) errors.push("The body is empty.");
  if (!isLayout && (typeof subject !== "string" || !subject.trim())) errors.push("The subject is empty.");
  if (typeof body === "string" && body.length > MAX_BODY) errors.push("The body is over 100 KB.");

  const check = (text, where) => {
    let inLoop = false;
    for (const match of String(text ?? "").matchAll(ANY_TAG)) {
      const tag = PARSED_TAG.exec(match[1]);
      if (!tag) { errors.push(`Malformed placeholder {{${match[1]}}} in the ${where}.`); continue; }
      const [, marker, name] = tag;
      if (marker) {
        if (name !== LINES_BLOCK) errors.push(`Unknown block {{${marker}${name}}} in the ${where}.`);
        else if (where === "subject") errors.push("The subject cannot use the lines block.");
        else if (marker === "#" && inLoop) errors.push("The lines block cannot be nested.");
        else if (marker === "/" && !inLoop) errors.push("{{/lines}} has no matching {{#lines}}.");
        else inLoop = marker === "#";
      } else if (PLACEHOLDERS.line.includes(name)) {
        if (where === "subject") errors.push(`{{${name}}} cannot be used in the subject.`);
        else if (!inLoop) errors.push(`{{${name}}} can only be used between {{#lines}} and {{/lines}}.`);
      } else if (PLACEHOLDERS.layout.includes(name)) {
        if (!(isLayout && where === "body")) errors.push(`{{${name}}} can only be used in the layout.`);
      } else if (!PLACEHOLDERS.order.includes(name)) {
        errors.push(`Unknown placeholder {{${name}}} in the ${where}.`);
      }
    }
    if (inLoop) errors.push("{{#lines}} is never closed with {{/lines}}.");
  };
  check(subject, "subject");
  check(body, "body");
  if (isLayout && typeof body === "string" && !/\{\{\s*content\s*\}\}/.test(body)) errors.push("The layout must contain {{content}}.");
  return errors.length ? { ok: false, errors } : { ok: true };
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const oneLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ");
const fill = (text, values) => text.replace(FILL, (whole, name) => (Object.hasOwn(values, name) ? values[name] : whole));
const formatToday = (now) => `${String(now.getUTCDate()).padStart(2, "0")}-${MONTHS[now.getUTCMonth()]}-${now.getUTCFullYear()}`;

function orderValues({ site, data, now }, encode) {
  const name = String(data.customerName ?? "").trim() || "Customer";
  const raw = {
    customer_name: name,
    customer_first_name: name.split(/\s+/)[0],
    customer_email: data.customerEmail,
    order_number: data.orderNumber,
    site_name: site.name,
    site_url: site.url,
    customer_service_email: site.serviceEmail,
    deliveries_email: site.deliveriesEmail,
    site_phone: site.phone,
    logo_url: site.logoUrl,
    today: formatToday(now),
    year: String(now.getUTCFullYear()),
    manufacturer: data.manufacturer,
    staff_name: data.staffName,
    expected_date: data.expectedDate,
    delivery_date: data.deliveryDate,
    tracking_number: data.trackingNumber,
    ticket_number: data.ticketNumber,
    reason: data.reason,
    message: data.message,
    order_numbers: data.orderNumbers,
    invoice_number: data.invoiceNumber,
    total_amount: data.totalAmount,
    confirm_link: data.confirmLink,
  };
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, encode(v ?? "")]));
  // A message typed by staff keeps its line breaks (after escaping, so the <br> is ours).
  if (encode === escapeHtml) values.message = values.message.replace(/\r?\n/g, "<br>");
  return values;
}

function lineValues(line) {
  return {
    line_name: escapeHtml(line.name),
    line_options: escapeHtml(line.options),
    line_qty: escapeHtml(line.qty),
    line_expected_date: escapeHtml(line.expectedDate),
    line_delivery_date: escapeHtml(line.deliveryDate),
    line_slot: escapeHtml(line.slot),
    line_drop: escapeHtml(line.drop),
    line_note: escapeHtml(line.note),
    line_order_number: escapeHtml(line.orderNumber),
    line_cost: escapeHtml(line.cost),
  };
}

// Each piece is filled once and never read again, so text inside a value cannot become a placeholder.
function expandBody(text, values, lines) {
  return text
    .split(SPLIT_LOOP)
    .map((part, i) => {
      if (i % 2 === 0) return fill(part, values);
      const inner = LOOP_INNER.exec(part)[1];
      return lines.map((line) => fill(inner, { ...values, ...lineValues(line) })).join("");
    })
    .join("");
}

/** @returns {{ subject: string, html: string }} */
export function renderEmail({ template, layout, site, data, now = new Date() }) {
  const context = { site, data, now };
  const html = expandBody(template.body, orderValues(context, escapeHtml), data.lines ?? []);
  const wrapped = fill(layout.body, { ...orderValues(context, escapeHtml), content: html });
  const subject = fill(template.subject, orderValues(context, oneLine)).replace(/[\r\n]+/g, " ").trim();
  return { subject, html: wrapped };
}

/** A fixed fake order with every optional field filled, for previews and tests. */
export function sampleEmailData() {
  return {
    customerName: "Jane Smith",
    orderNumber: "CFS100123",
    expectedDate: "30-Nov-2026",
    deliveryDate: "02-Dec-2026",
    trackingNumber: "TNT123456789",
    ticketNumber: "48213",
    customerEmail: "jane@example.com",
    manufacturer: "Sample Manufacturer",
    staffName: "Sam Patel",
    reason: "Customer request",
    message: "This is a sample message.",
    orderNumbers: "CFS100123, CFS100124",
    invoiceNumber: "CFSINV-20261127120000",
    totalAmount: "£1,250.00",
    confirmLink: "https://example.myshopify.com/apps/cfs-delivery/delivery-confirm?t=preview",
    lines: [
      { name: "Natural Gold 3500 Platform Top Divan Bed", options: "Drawer: with 2 Drawer, Fabric: Carlton Black", qty: 1, expectedDate: "30-Nov-2026", deliveryDate: "02-Dec-2026", slot: "AM (Between 8am – 1pm)", drop: "2", note: "Part delivery", orderNumber: "CFS100123", cost: "£1,000.00" },
      { name: "Comfort Mattress", options: "", qty: 2, expectedDate: "30-Nov-2026", deliveryDate: "02-Dec-2026", drop: "2", note: "", orderNumber: "CFS100124", cost: "£250.00" },
    ],
  };
}
