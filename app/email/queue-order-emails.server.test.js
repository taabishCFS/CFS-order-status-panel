import { beforeEach, describe, expect, it } from "vitest";
import { fakeEmailDb } from "./fixtures";
import { queueOrderEmails } from "./queue-order-emails.server";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam Patel", source: "verified" };
const config = { enabled: true, mode: "log", internalCopyTo: "", fromAddress: "orders@orders.cfsonline.co.uk" };
const L = (n) => `gid://shopify/LineItem/${n}`;
const order = (over = {}) => ({ shop: SHOP, orderId: "gid://shopify/Order/123", name: "#1001", customerName: "Jane Smith", email: "jane@example.com", site: null, ...over });
const lines = [
  { shop: SHOP, orderId: "gid://shopify/Order/123", lineId: L(1), title: "Bed", variantTitle: "Small", quantity: 1, vendor: "Acme", properties: [{ key: "Fabric", value: "Black" }, { key: "_hidden", value: "x" }] },
  { shop: SHOP, orderId: "gid://shopify/Order/123", lineId: L(2), title: "Mattress", variantTitle: null, quantity: 2, vendor: "Acme", properties: [] },
];
const req = (over = {}) => ({ orderId: "gid://shopify/Order/123", statusId: 3, lineIds: [L(1), L(2)], idempotencyKey: "k1", extras: {}, ...over });
let db;
beforeEach(() => { db = fakeEmailDb({ order: order(), lines }); });
const queue = (over = {}, cfg = config, o = null) => queueOrderEmails(o ?? db, { shop: SHOP, orderId: "gid://shopify/Order/123", request: req(over), actor, config: cfg });

describe("queueOrderEmails", () => {
  it("queues one customer email for the save, with the actor and the rendered text", async () => {
    const result = await queue();
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ kind: "customer", recipient: "jane@example.com", status: "queued", templateKey: "status.3", templateVersion: 1, actorName: "Sam Patel", orderName: "#1001", dedupeKey: "k1:0:customer" });
    expect(result.rows[0].subject).toBe("Order in Progress : Order No. #1001 : Choice Furniture Superstore");
    expect(result.rows[0].html).toContain("Dear <strong>Jane</strong>");
    expect(result.rows[0].from).toBe("Customer Service CFS UK <orders@orders.cfsonline.co.uk>");
    expect(result.rows[0].replyTo).toBe("customerservice@cfsonline.co.uk");
  });

  it("a request with no idempotency key is never a duplicate of an earlier one", async () => {
    await queue({ idempotencyKey: undefined });
    const again = await queue({ idempotencyKey: undefined });
    expect(again.duplicate).toBe(false);
    expect(again.rows).toHaveLength(1);
  });

  it("the same request twice is a duplicate and creates nothing new", async () => {
    await queue();
    const again = await queue();
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(db.rows).toHaveLength(1);
  });

  it("queues one email per line for status 18, with line details", async () => {
    const result = await queue({ statusId: 18 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].html).toContain("Bed");
    expect(result.rows[0].html).toContain("Fabric: Black");
    expect(result.rows[0].html).not.toContain("_hidden");
    expect(result.rows[0].html).not.toContain("Mattress");
    expect(result.rows[1].html).toContain("Mattress");
    expect(result.rows.map((r) => r.dedupeKey)).toEqual(["k1:0:customer", "k1:1:customer"]);
  });

  it("a template request uses that template, the extras, and the deliveries sender for delivery mails", async () => {
    const result = await queue({ statusId: undefined, templateKey: "tracking", lineIds: [], extras: { trackingNumber: "TNT777" } });
    expect(result.rows[0].html).toContain("TNT777");
    expect(result.rows[0].from).toBe("Deliveries CFS UK <orders@orders.cfsonline.co.uk>");
    expect(result.rows[0].replyTo).toBe("deliveries@cfsonline.co.uk");
  });

  it("uses the order's site wording and sender, and falls back to CFS for an unknown site", async () => {
    const ud = await queue({}, config, fakeEmailDb({ order: order({ site: "UD" }), lines }));
    expect(ud.rows[0].subject).toContain("Urbandeco");
    expect(ud.rows[0].from).toContain("Customer Service Urbandeco UK");
    const odd = await queue({}, config, fakeEmailDb({ order: order({ site: "ZZZ" }), lines }));
    expect(odd.rows[0].subject).toContain("Choice Furniture Superstore");
  });

  it("escapes HTML in the customer name inside the stored html", async () => {
    const result = await queue({ statusId: 15 }, config, fakeEmailDb({ order: order({ customerName: "<script>x</script> Bob" }), lines }));
    expect(result.rows[0].html).not.toContain("<script>");
  });

  it("an order without an email address gives a skipped, logged row", async () => {
    const result = await queue({}, config, fakeEmailDb({ order: order({ email: null }), lines }));
    expect(result.rows[0]).toMatchObject({ status: "skipped", error: "no_recipient", kind: "customer" });
  });

  it("adds an internal copy only when INTERNAL_COPY_TO is set", async () => {
    expect((await queue()).rows.map((r) => r.kind)).toEqual(["customer"]);
    const copy = await queue({ idempotencyKey: "k2" }, { ...config, internalCopyTo: "ops@cfsonline.co.uk" });
    expect(copy.rows.map((r) => [r.kind, r.recipient])).toEqual([["customer", "jane@example.com"], ["internal_copy", "ops@cfsonline.co.uk"]]);
    expect(copy.rows[1].dedupeKey).toBe("k2:0:internal_copy");
  });

  it("refuses when email is off, the order is unknown, the template is unknown, or nothing would be sent", async () => {
    expect(await queue({}, { ...config, enabled: false })).toEqual({ ok: false, code: "email_off" });
    expect(await queue({}, config, fakeEmailDb({ order: null, lines }))).toEqual({ ok: false, code: "no_order" });
    expect(await queue({ statusId: undefined, templateKey: "nope.template" })).toEqual({ ok: false, code: "unknown_template" });
    expect(await queue({ statusId: 2 })).toEqual({ ok: false, code: "nothing_to_send" });
    expect(db.rows).toHaveLength(0);
  });
});
