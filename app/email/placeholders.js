// The placeholders staff may use in an email template. Anything else is refused when a template is saved.
// If a legacy template needs another, add it here and to render.server.js (with a test); never invent wording.
export const PLACEHOLDERS = {
  // Usable anywhere in a body or a subject, and inside the lines block.
  order: [
    "customer_name",
    "customer_first_name",
    "customer_email",
    "order_number",
    "site_name",
    "site_url",
    "customer_service_email",
    "deliveries_email",
    "site_phone",
    "logo_url",
    "today",
    "year",
    "manufacturer",
    "staff_name",
    "expected_date",
    "delivery_date",
    "tracking_number",
    "ticket_number",
    "reason",
    "message",
    "order_numbers",
    "invoice_number",
    "total_amount",
  ],
  // Only between {{#lines}} and {{/lines}} (once per selected line).
  line: ["line_name", "line_options", "line_qty", "line_expected_date", "line_delivery_date", "line_slot", "line_drop", "line_note", "line_order_number", "line_cost"],
  // Only in the layout: where the template's own text goes.
  layout: ["content"],
};

export const LINES_BLOCK = "lines";
