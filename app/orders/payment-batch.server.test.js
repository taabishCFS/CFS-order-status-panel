import { describe, expect, it } from "vitest";
import { buildBatch, readBatchInput, sendBatch, suggestInvoiceNo } from "./payment-batch.server.js";
import { LAYOUT } from "../email/seed/layout.js";
import { OTHER_TEMPLATES } from "../email/seed/other-templates.js";
import { SITES } from "../email/seed/sites.js";
import { SEEDED_TEMPLATES } from "../email/seed/index.server.js";

const SHOP = "s.myshopify.com";
const L = (n) => `gid://shopify/LineItem/${n}`;
const O = (n) => `gid://shopify/Order/${n}`;
const KEY = "abcdef123456";

function makeDb({ lines, contacts = [], payments = [] }) {
  const outbox = [];
  const hit = (w = {}) => (r) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "in" in v ? v.in.includes(r[k]) : v && typeof v === "object" && "gt" in v ? r[k] > v.gt : r[k] === v));
  const advice = OTHER_TEMPLATES.find((t) => t.key === "supplier.payment_advice");
  const templates = [{ shop: SHOP, key: "layout", subject: LAYOUT.subject, body: LAYOUT.body, version: 1 }, { shop: SHOP, key: advice.key, subject: advice.subject, body: advice.body, version: 1 }];
  return {
    outbox, payments,
    orderLine: { findMany: async ({ where }) => lines.filter(hit(where)) },
    order: { findMany: async ({ where }) => lines.map((l) => ({ shop: SHOP, orderId: l.orderId, name: `#CFS${l.orderId.split("/").pop()}` })).filter(hit(where)) },
    lineSupplierInvoice: { findMany: async () => [] },
    linePayment: {
      findMany: async ({ where }) => payments.filter(hit(where)),
      upsert: async ({ where, create, update }) => { const r = payments.find((p) => p.lineId === where.shop_lineId.lineId); if (r) Object.assign(r, update); else payments.push({ ...create }); },
    },
    supplierContact: { findFirst: async ({ where }) => contacts.find((c) => c.brand === where.brand) ?? null },
    // ensureSeeded: everything is already there.
    emailSite: { findMany: async () => SITES.map((s) => ({ code: s.code })), findUnique: async ({ where }) => ({ shop: SHOP, ...SITES.find((s) => s.code === where.shop_code.code) }) },
    emailTemplate: { findMany: async () => SEEDED_TEMPLATES.map((t) => ({ key: t.key })), findUnique: async ({ where }) => templates.find((t) => t.key === where.shop_key.key) ?? null },
    emailOutbox: { create: async ({ data }) => { if (outbox.some((r) => r.dedupeKey === data.dedupeKey)) throw Object.assign(new Error("dup"), { code: "P2002" }); outbox.push(data); return data; }, findMany: async () => outbox },
  };
}
const line = (n, extra = {}) => ({ shop: SHOP, orderId: O(n), lineId: L(n), vendor: "Duke Beds", title: `Bed ${n}`, variantTitle: "Double", sku: `S${n}`, variantId: null, quantity: 1, priceMinor: 10000, discountMinor: 0, lineStatusId: 4, orderCreatedAt: new Date("2026-11-20T10:00:00Z"), ...extra });
const config = { enabled: true, fromAddress: "orders@example.com", internalCopyTo: "copy@example.com" };
const actor = { id: "u1", name: "Sam" };

describe("payment batch input", () => {
  it("needs lines and an invoice number with safe characters", () => {
    expect(readBatchInput({ op: "draft", lineIds: [L(1), "bad", L(1)], invoiceNo: " INV-1/2 " }).value).toEqual({ op: "draft", lineIds: [L(1)], invoiceNo: "INV-1/2" });
    expect(readBatchInput({ op: "draft", lineIds: [], invoiceNo: "X" }).error).toBe("no_lines");
    expect(readBatchInput({ op: "draft", lineIds: [L(1)], invoiceNo: " " }).error).toBe("invoice_required");
    expect(readBatchInput({ op: "draft", lineIds: [L(1)], invoiceNo: "A'; drop" }).error).toBe("bad_invoice");
    expect(readBatchInput({ op: "send", lineIds: [L(1)], invoiceNo: "X" }).error).toBe("bad_request");
    expect(readBatchInput({ op: "send", lineIds: [L(1)], invoiceNo: "X", idempotencyKey: KEY }).value.idempotencyKey).toBe(KEY);
  });
  it("suggests CFSINV with the UK date and time", () => {
    expect(suggestInvoiceNo(new Date("2026-07-01T09:05:07Z"))).toBe("CFSINV-20260701100507");
  });
});

describe("building and sending a batch", () => {
  const contacts = [{ shop: SHOP, brand: "Duke Beds", email: "sales@duke.example", cc: "acc@duke.example, sales@duke.example" }];
  it("refuses two brands, a missing cost and a supplier without an email", async () => {
    const two = makeDb({ lines: [line(1), line(2, { vendor: "Other" })], contacts, payments: [{ shop: SHOP, lineId: L(1), manualCostMinor: 100 }, { shop: SHOP, lineId: L(2), manualCostMinor: 100 }] });
    expect((await buildBatch(two, undefined, SHOP, { lineIds: [L(1), L(2)], invoiceNo: "X" })).code).toBe("one_brand");
    const noCost = makeDb({ lines: [line(1)], contacts });
    expect(await buildBatch(noCost, undefined, SHOP, { lineIds: [L(1)], invoiceNo: "X" })).toMatchObject({ ok: false, code: "no_cost" });
    const noEmail = makeDb({ lines: [line(1)], payments: [{ shop: SHOP, lineId: L(1), manualCostMinor: 100 }] });
    expect(await buildBatch(noEmail, undefined, SHOP, { lineIds: [L(1)], invoiceNo: "X" })).toMatchObject({ ok: false, code: "no_email", message: expect.stringContaining("Duke Beds") });
    expect((await buildBatch(noEmail, undefined, SHOP, { lineIds: [L(9)], invoiceNo: "X" })).code).toBe("no_lines");
  });
  it("drafts with the manual costs and the supplier's addresses, changing nothing", async () => {
    const db = makeDb({ lines: [line(1), line(2)], contacts, payments: [{ shop: SHOP, lineId: L(1), manualCostMinor: 12500 }, { shop: SHOP, lineId: L(2), manualCostMinor: 4000 }] });
    const b = await buildBatch(db, undefined, SHOP, { lineIds: [L(1), L(2)], invoiceNo: "INV9" });
    expect(b).toMatchObject({ ok: true, brand: "Duke Beds", recipients: ["sales@duke.example", "acc@duke.example"], totalMinor: 16500, invoiceNo: "INV9" });
    expect(b.lines[0]).toMatchObject({ orderName: "CFS1", title: "Bed 1", quantity: 1, costMinor: 12500 });
    expect(db.payments.every((p) => !p.batchInvoiceNo)).toBe(true);
  });
  it("send stamps the invoice number and queues the payment advice once", async () => {
    const db = makeDb({ lines: [line(1), line(2)], contacts, payments: [{ shop: SHOP, lineId: L(1), manualCostMinor: 12500 }, { shop: SHOP, lineId: L(2), manualCostMinor: 4000 }] });
    const request = { lineIds: [L(1), L(2)], invoiceNo: "INV9", idempotencyKey: KEY };
    const r = await sendBatch(db, { shop: SHOP, graphql: undefined, request, actor, config });
    expect(r).toMatchObject({ ok: true, brand: "Duke Beds", lines: 2, totalMinor: 16500, queued: 3, duplicate: false });
    expect(db.payments.map((p) => p.batchInvoiceNo)).toEqual(["INV9", "INV9"]);
    expect(db.outbox.map((e) => e.recipient)).toEqual(["sales@duke.example", "acc@duke.example", "copy@example.com"]);
    const mail = db.outbox[0];
    expect(mail).toMatchObject({ kind: "supplier", templateKey: "supplier.payment_advice", orderName: "CFS1, CFS2" });
    expect(mail.subject).toContain("Payment Advice - Invoice INV9");
    expect(mail.html).toContain("Dear Duke Beds");
    expect(mail.html).toContain("£125.00");
    expect(mail.html).toContain("£165.00");
    expect(mail.html).not.toMatch(/\{\{/);
    expect((await sendBatch(db, { shop: SHOP, graphql: undefined, request, actor, config })).duplicate).toBe(true);
    expect(db.outbox).toHaveLength(3);
  });
  it("names the addresses test mode will not email", async () => {
    const db = makeDb({ lines: [line(1)], contacts, payments: [{ shop: SHOP, lineId: L(1), manualCostMinor: 100 }] });
    const r = await sendBatch(db, { shop: SHOP, request: { lineIds: [L(1)], invoiceNo: "X", idempotencyKey: KEY }, actor, config: { ...config, mode: "test", allowlist: ["acc@duke.example"] } });
    expect(r).toMatchObject({ ok: true, blocked: ["sales@duke.example"], mode: "test" });
  });
  it("changes nothing when email is off", async () => {
    const db = makeDb({ lines: [line(1)], contacts, payments: [{ shop: SHOP, lineId: L(1), manualCostMinor: 100 }] });
    expect(await sendBatch(db, { shop: SHOP, request: { lineIds: [L(1)], invoiceNo: "X", idempotencyKey: KEY }, actor, config: { enabled: false } })).toMatchObject({ ok: false, code: "email_off" });
    expect(db.payments[0].batchInvoiceNo).toBeUndefined();
  });
});
