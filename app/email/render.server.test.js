import { describe, expect, it } from "vitest";
import { PLACEHOLDERS } from "./placeholders";
import { renderEmail, sampleEmailData, validateTemplate } from "./render.server";

const site = { name: "Choice Furniture Superstore", url: "https://www.choicefurnituresuperstore.co.uk/", serviceEmail: "customerservice@cfsonline.co.uk", deliveriesEmail: "deliveries@cfsonline.co.uk", phone: "0116-296-3800", logoUrl: "https://example.com/logo.png" };
const layout = { body: "<div>{{content}}</div><p>{{site_phone}} {{customer_service_email}} {{site_name}}</p>" };
const NOW = new Date("2026-11-21T10:00:00Z");
const render = (template, data = {}) => renderEmail({ template, layout, site, data: { customerName: "Jane Smith", orderNumber: "CFS1", lines: [], ...data }, now: NOW });

describe("validateTemplate", () => {
  const ok = { key: "status.3", subject: "Order {{order_number}}", body: "Dear {{customer_first_name}}" };

  it("accepts a good template", () => expect(validateTemplate(ok)).toEqual({ ok: true }));

  it("names an unknown placeholder", () => {
    const result = validateTemplate({ ...ok, body: "Hi {{nope}}" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("nope");
  });

  it("refuses an empty subject or body, but a layout needs no subject", () => {
    expect(validateTemplate({ ...ok, subject: "  " }).ok).toBe(false);
    expect(validateTemplate({ ...ok, body: "" }).ok).toBe(false);
    expect(validateTemplate({ key: "layout", subject: "", body: "{{content}}" })).toEqual({ ok: true });
  });

  it("refuses a lines loop that is not closed, nested, or unknown", () => {
    expect(validateTemplate({ ...ok, body: "{{#lines}}{{line_name}}" }).ok).toBe(false);
    expect(validateTemplate({ ...ok, body: "{{/lines}}" }).ok).toBe(false);
    expect(validateTemplate({ ...ok, body: "{{#lines}}{{#lines}}x{{/lines}}{{/lines}}" }).ok).toBe(false);
    expect(validateTemplate({ ...ok, body: "{{#things}}x{{/things}}" }).ok).toBe(false);
  });

  it("refuses a line placeholder outside the loop, and a loop or line placeholder in the subject", () => {
    expect(validateTemplate({ ...ok, body: "{{line_name}}" }).ok).toBe(false);
    expect(validateTemplate({ ...ok, subject: "{{line_name}}" }).ok).toBe(false);
    expect(validateTemplate({ ...ok, body: "{{#lines}}{{line_name}} {{order_number}}{{/lines}}" })).toEqual({ ok: true });
  });

  it("requires the layout to contain {{content}}, and allows {{content}} nowhere else", () => {
    expect(validateTemplate({ key: "layout", subject: "", body: "no slot" }).ok).toBe(false);
    expect(validateTemplate({ ...ok, body: "{{content}}" }).ok).toBe(false);
  });

  it("refuses a body over 100 KB", () => {
    expect(validateTemplate({ ...ok, body: "x".repeat(100 * 1024 + 1) }).ok).toBe(false);
  });

  it("knows every documented placeholder", () => {
    const body = [...PLACEHOLDERS.order.map((p) => `{{${p}}}`), `{{#lines}}${PLACEHOLDERS.line.map((p) => `{{${p}}}`).join("")}{{/lines}}`].join(" ");
    expect(validateTemplate({ ...ok, body })).toEqual({ ok: true });
  });
});

describe("renderEmail", () => {
  it("fills the order placeholders and wraps the message in the layout", () => {
    const { subject, html } = render({ subject: "Order No. {{order_number}} : {{site_name}}", body: "Dear {{customer_first_name}} ({{customer_name}}) on {{today}}" });
    expect(subject).toBe("Order No. CFS1 : Choice Furniture Superstore");
    expect(html).toBe("<div>Dear Jane (Jane Smith) on 21-Nov-2026</div><p>0116-296-3800 customerservice@cfsonline.co.uk Choice Furniture Superstore</p>");
  });

  it("fills the optional values and leaves them empty when absent", () => {
    const withValues = render({ subject: "s", body: "{{expected_date}}|{{delivery_date}}|{{tracking_number}}|{{reason}}|{{message}}|{{order_numbers}}" }, { expectedDate: "30-Nov-2026", deliveryDate: "02-Dec-2026", trackingNumber: "T1", reason: "R", message: "M", orderNumbers: "A, B" });
    expect(withValues.html).toContain("30-Nov-2026|02-Dec-2026|T1|R|M|A, B");
    expect(render({ subject: "s", body: "[{{expected_date}}{{tracking_number}}]" }).html).toContain("[]");
  });

  it("renders the lines block once per line, and nothing for no lines", () => {
    const tpl = { subject: "s", body: "{{#lines}}<tr>{{line_name}} x{{line_qty}} {{line_options}} {{line_expected_date}}</tr>{{/lines}}" };
    const lines = [{ name: "Bed", qty: 1, options: "Fabric: Black", expectedDate: "30-Nov-2026" }, { name: "Mattress", qty: 2, options: "", expectedDate: "" }];
    expect(render(tpl, { lines }).html).toContain("<tr>Bed x1 Fabric: Black 30-Nov-2026</tr><tr>Mattress x2  </tr>");
    expect(render(tpl, { lines: [] }).html).not.toContain("<tr>");
  });

  it("fills the year, customer email, manufacturer, staff name and the delivery slot", () => {
    const tpl = { subject: "s", body: "{{year}}|{{customer_email}}|{{manufacturer}}|{{staff_name}}|{{#lines}}{{line_slot}}{{/lines}}" };
    const { html } = render(tpl, { customerEmail: "a@b.com", manufacturer: "Acme & Co", staffName: "Sam Patel", lines: [{ name: "Bed", qty: 1, slot: "AM (Between 8am – 1pm)" }] });
    expect(html).toContain("2026|a@b.com|Acme &amp; Co|Sam Patel|AM (Between 8am – 1pm)");
  });

  it("fills the ticket number, and keeps line breaks in a typed message", () => {
    const { html } = render({ subject: "s", body: "{{ticket_number}}|{{message}}" }, { ticketNumber: "48213", message: "Line 1\nLine <b>2</b>" });
    expect(html).toContain("48213|Line 1<br>Line &lt;b&gt;2&lt;/b&gt;");
  });

  it("escapes HTML in customer and product names", () => {
    const tpl = { subject: "s", body: "{{customer_name}} / {{#lines}}{{line_name}}{{/lines}}" };
    const { html } = render(tpl, { customerName: "<script>x</script>", lines: [{ name: "A & B", qty: 1 }] });
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt; / A &amp; B");
    expect(html).not.toContain("<script>");
  });

  it("does not treat placeholder text inside customer data as a placeholder", () => {
    const { html } = render({ subject: "s", body: "{{customer_name}}" }, { customerName: "{{order_number}}" });
    expect(html).toContain("{{order_number}}");
    expect(html).not.toContain("CFS1");
  });

  it("keeps the subject on one line (no header injection)", () => {
    const { subject } = render({ subject: "Hi {{customer_name}}", body: "b" }, { customerName: "Jane\r\nBcc: evil@x.com" });
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("falls back to Customer when there is no name", () => {
    const { html } = render({ subject: "s", body: "Dear {{customer_first_name}} / {{customer_name}}" }, { customerName: "" });
    expect(html).toContain("Dear Customer / Customer");
  });

  it("takes the first word of the name as the first name", () => {
    expect(render({ subject: "s", body: "{{customer_first_name}}" }, { customerName: "  Mary Ann Jones " }).html).toContain(">Mary<");
  });

  it("renders the sample data without leaving any placeholder behind", () => {
    const body = [...PLACEHOLDERS.order.map((p) => `{{${p}}}`), "{{#lines}}", ...PLACEHOLDERS.line.map((p) => `{{${p}}}`), "{{/lines}}"].join(" ");
    const { subject, html } = renderEmail({ template: { subject: "{{order_number}}", body }, layout, site, data: sampleEmailData(), now: NOW });
    expect(subject).not.toContain("{{");
    expect(html).not.toContain("{{");
    expect(sampleEmailData().lines.length).toBe(2);
  });
});
