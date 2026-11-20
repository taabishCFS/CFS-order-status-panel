import { beforeEach, describe, expect, it } from "vitest";
import { queueBulkEmails, readBulkRequest } from "./bulk-email.server";
import { fakeEmailDb } from "./fixtures";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam Patel", source: "verified" };
const config = { enabled: true, mode: "log", internalCopyTo: "", fromAddress: "orders@orders.cfsonline.co.uk" };
const O = (n) => `gid://shopify/Order/${n}`;
const L = (n) => `gid://shopify/LineItem/${n}`;
const orders = [
  { shop: SHOP, orderId: O(1), name: "#1001", customerName: "Jane Smith", email: "jane@example.com", site: null },
  { shop: SHOP, orderId: O(2), name: "#1002", customerName: "Jane Smith", email: "JANE@example.com ", site: null },
  { shop: SHOP, orderId: O(3), name: "#1003", customerName: "Bob Jones", email: "bob@example.com", site: null },
  { shop: SHOP, orderId: O(4), name: "#1004", customerName: "No Mail", email: null, site: null },
];
const lines = [
  { shop: SHOP, orderId: O(1), lineId: L(1) },
  { shop: SHOP, orderId: O(1), lineId: L(2) },
  { shop: SHOP, orderId: O(2), lineId: L(3) },
  { shop: SHOP, orderId: O(3), lineId: L(4) },
  { shop: SHOP, orderId: O(4), lineId: L(5) },
];
const request = (over = {}) => ({ lineIds: [L(1), L(2), L(3), L(4)], subject: "Update on your order {{order_numbers}}", message: "Hi {{customer_name}},\nAbout {{order_numbers}}.", idempotencyKey: "k1", ...over });

let db;
beforeEach(() => {
  db = fakeEmailDb();
  db.order = { findMany: async ({ where }) => orders.filter((o) => o.shop === where.shop && where.orderId.in.includes(o.orderId)) };
  db.orderLine = { findMany: async ({ where }) => lines.filter((l) => l.shop === where.shop && where.lineId.in.includes(l.lineId)) };
});
const run = (over = {}, cfg = config, extra = {}) => queueBulkEmails(db, { shop: SHOP, request: request(over), actor, config: cfg, ...extra });
const customerRows = () => db.rows.filter((r) => r.kind === "customer" && r.status === "queued");

describe("queueBulkEmails", () => {
  it("sends one email per customer address, however many orders or lines they have", async () => {
    const result = await run();
    expect(result).toMatchObject({ ok: true, customers: 2, orders: 3, withoutEmail: 0 });
    const rows = customerRows();
    expect(rows.map((r) => r.recipient).sort()).toEqual(["bob@example.com", "jane@example.com"]);
    const jane = rows.find((r) => r.recipient === "jane@example.com");
    expect(jane).toMatchObject({ templateKey: "bulk.customer", orderId: O(1), orderName: "#1001, #1002", actorName: "Sam Patel", kind: "customer" });
  });

  it("fills the customer name and order numbers into the subject and the message", async () => {
    await run();
    const jane = customerRows().find((r) => r.recipient === "jane@example.com");
    expect(jane.subject).toBe("Update on your order #1001, #1002 : Choice Furniture Superstore");
    expect(jane.html).toContain("Hi Jane Smith,<br>About #1001, #1002.");
    const bob = customerRows().find((r) => r.recipient === "bob@example.com");
    expect(bob.subject).toBe("Update on your order #1003 : Choice Furniture Superstore");
  });

  it("keeps the message as text: tags typed by staff are shown, not run", async () => {
    await run({ message: "<script>alert(1)</script> {{site_name}}" });
    const html = customerRows()[0].html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("{{site_name}}");
    expect(html).not.toContain("<script>");
  });

  it("records every order a customer's email covered, so each order shows it", async () => {
    await run();
    const covered = db.rows.filter((r) => r.status === "skipped" && r.error === "included_in_bulk");
    expect(covered.map((r) => r.orderId)).toEqual([O(2)]);
    expect(covered[0]).toMatchObject({ recipient: "jane@example.com", orderName: "#1002", templateKey: "bulk.customer" });
  });

  it("counts orders with no email address and sends them nothing", async () => {
    const result = await run({ lineIds: [L(1), L(5)] });
    expect(result).toMatchObject({ ok: true, customers: 1, orders: 1, withoutEmail: 1 });
    expect(db.rows.some((r) => r.orderId === O(4))).toBe(false);
  });

  it("says so when no selected order has an email address", async () => {
    expect(await run({ lineIds: [L(5)] })).toEqual({ ok: false, code: "no_recipients", withoutEmail: 1 });
    expect(db.rows).toHaveLength(0);
  });

  it("adds an internal copy per customer when one is configured", async () => {
    await run({}, { ...config, internalCopyTo: "copy@cfs.test" });
    const copies = db.rows.filter((r) => r.kind === "internal_copy");
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({ recipient: "copy@cfs.test", status: "queued" });
    expect(copies[0].subject).toMatch(/ : Sam Patel$/);
  });

  it("a dry run lists who would be emailed and writes nothing", async () => {
    const result = await run({}, config, { dryRun: true });
    expect(result).toMatchObject({ ok: true, customers: 2, orders: 3, withoutEmail: 0 });
    expect(result.recipients).toEqual([
      { email: "jane@example.com", name: "Jane Smith", orders: ["#1001", "#1002"] },
      { email: "bob@example.com", name: "Bob Jones", orders: ["#1003"] },
    ]);
    expect(db.rows).toHaveLength(0);
  });

  it("the same request twice creates nothing new", async () => {
    await run();
    const before = db.rows.length;
    expect(await run()).toMatchObject({ ok: true, duplicate: true });
    expect(db.rows).toHaveLength(before);
  });

  it("refuses when email is off, when no lines are found, and for a bad subject", async () => {
    expect(await run({}, { ...config, enabled: false })).toEqual({ ok: false, code: "email_off" });
    expect(await run({ lineIds: [L(99)] })).toEqual({ ok: false, code: "no_lines" });
    const bad = await run({ subject: "Hello {{nonsense}}" });
    expect(bad).toMatchObject({ ok: false, code: "bad_subject" });
    expect(db.rows).toHaveLength(0);
  });

  it("ignores lines that belong to another shop", async () => {
    lines.push({ shop: "other.myshopify.com", orderId: O(1), lineId: L(77) });
    expect(await run({ lineIds: [L(77)] })).toEqual({ ok: false, code: "no_lines" });
    lines.pop();
  });
});

describe("readBulkRequest", () => {
  const ok = { lineIds: [L(1)], subject: "S", message: "M", idempotencyKey: "k", dryRun: true };
  it("accepts a good request", () => {
    expect(readBulkRequest(ok)).toEqual({ value: { lineIds: [L(1)], subject: "S", message: "M", idempotencyKey: "k", dryRun: true } });
    expect(readBulkRequest({ ...ok, dryRun: undefined }).value.dryRun).toBe(false);
  });
  it("trims the subject and message and defaults a blank subject", () => {
    expect(readBulkRequest({ ...ok, subject: "  ", message: "  Hi  " }).value).toMatchObject({ subject: "Update on your order {{order_numbers}}", message: "Hi" });
  });
  it("refuses bad input", () => {
    const bads = [null, [], { ...ok, lineIds: [] }, { ...ok, lineIds: ["x"] }, { ...ok, lineIds: Array.from({ length: 501 }, (_, i) => L(i + 1)) }, { ...ok, message: "   " }, { ...ok, message: "x".repeat(5001) }, { ...ok, subject: "x".repeat(201) }, { ...ok, idempotencyKey: "" }, { ...ok, dryRun: "yes" }];
    for (const b of bads) expect(readBulkRequest(b)).toEqual({ error: "bad_request" });
  });
});
