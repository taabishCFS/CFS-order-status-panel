import { describe, expect, it, vi } from "vitest";
import { invoiceEmailHtml, invoiceEmailSubject } from "./invoice-email";
import { queueInvoiceEmail } from "./invoice-email.server";

const doc = {
  name: "#1038", createdAt: "2026-11-22T10:00:00Z", email: "a@b.co", shipping: ["Matt <P>"], phone: "",
  lines: [{ title: "Oslo Sideboard", variantTitle: "Oak", qty: 1, finalMinor: 9000 }],
  delivery: [{ label: "Free Door Delivery", minor: 0 }], services: [{ label: "Two Man Delivery", minor: 2000 }],
  subtotalMinor: 10000, discountMinor: 1000, totalMinor: 11000, paidMinor: 0, balanceMinor: 11000,
};
const site = { name: "Choice Furniture Superstore", email: "cs@x.co", phone: "0116 296 3800" };

describe("invoice email", () => {
  it("lists the items and totals and escapes customer text", () => {
    const html = invoiceEmailHtml(doc, site);
    expect(invoiceEmailSubject(doc, site)).toBe("Your invoice for order #1038 - Choice Furniture Superstore");
    expect(html).toContain("Oslo Sideboard");
    expect(html).toContain("Two Man Delivery");
    expect(html).toContain("Balance due");
    expect(html).toContain("Matt &lt;P&gt;");
    expect(html).not.toContain("Matt <P>");
  });
});

describe("queueInvoiceEmail", () => {
  const base = { shop: "s", orderId: "gid://shopify/Order/5", doc, site, staff: { id: "1", name: "Sam" }, config: { enabled: true, fromAddress: "orders@x.co" }, idempotencyKey: "k1" };
  const db = () => ({ emailOutbox: { create: vi.fn(async ({ data }) => ({ ...data, id: "e1" })) } });

  it("queues one customer email with the placeholder template", async () => {
    const d = db();
    const r = await queueInvoiceEmail(d, base);
    expect(r).toMatchObject({ ok: true, duplicate: false });
    expect(d.emailOutbox.create.mock.calls[0][0].data).toMatchObject({ recipient: "a@b.co", kind: "customer", templateKey: "invoice.resend", status: "queued", from: "Choice Furniture Superstore <orders@x.co>", replyTo: "cs@x.co", dedupeKey: "k1:invoice:customer" });
  });
  it("refuses when email is off or the order has no email", async () => {
    expect(await queueInvoiceEmail(db(), { ...base, config: { enabled: false } })).toEqual({ ok: false, code: "email_off" });
    expect(await queueInvoiceEmail(db(), { ...base, doc: { ...doc, email: "" } })).toEqual({ ok: false, code: "no_recipient" });
  });
  it("returns the existing row for a repeated key", async () => {
    const d = db();
    d.emailOutbox.create = vi.fn(async () => { throw Object.assign(new Error("dup"), { code: "P2002" }); });
    d.emailOutbox.findMany = vi.fn(async () => [{ id: "old", recipient: "a@b.co" }]);
    expect(await queueInvoiceEmail(d, base)).toMatchObject({ ok: true, duplicate: true });
  });
});
