import { describe, expect, it } from "vitest";
import { ConfiguratorError } from "./client.server";
import { fakeVersionsDb } from "./fixtures";
import { currentConfiguration } from "./versions.server";

const SHOP = "a.myshopify.com";
const ORDER = "gid://shopify/Order/1";
const config = { baseCents: 99999, unitCents: 112999, options: [{ group: "Select Fabric", label: "Carlton Caramel", cfsId: "17020903", quantity: 1, cents: 13000 }] };
const line = (over = {}) => ({
  lineItemId: "gid://shopify/LineItem/1", productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/8",
  title: "Natural Gold Bed", variantTitle: "2ft 6in", quantity: 2, unitCents: 112999, configuration: config, editable: true, ...over,
});
const callWith = (lines, calls = []) => async (req) => { calls.push(req); return { ok: true, orderName: "#1", financialStatus: "PAID", cancelledAt: null, lines }; };

describe("currentConfiguration", () => {
  it("asks the configurator for the order and creates version 1 the first time a line is read", async () => {
    const db = fakeVersionsDb();
    const calls = [];
    const out = await currentConfiguration(db, callWith([line()], calls), { shop: SHOP, orderId: ORDER });
    expect(calls).toEqual([{ shop: SHOP, path: `/staff/order-lines?order=${ORDER}` }]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ shop: SHOP, orderId: ORDER, lineItemId: "gid://shopify/LineItem/1", version: 1, source: "original", status: "applied", unitMinor: 112999, deltaMinor: 0, configuration: config });
    expect(out.lines[0]).toMatchObject({ lineItemId: "gid://shopify/LineItem/1", editable: true, version: 1, configuration: config, unitMinor: 112999, quantity: 2 });
    expect(out.lines[0].history).toHaveLength(1);
  });

  it("a second read gives the same version and creates no new row", async () => {
    const db = fakeVersionsDb();
    await currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER });
    const again = await currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER });
    expect(db.rows).toHaveLength(1);
    expect(again.lines[0].version).toBe(1);
  });

  it("two reads at the same moment create one row", async () => {
    const db = fakeVersionsDb();
    await Promise.all([1, 2].map(() => currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER })));
    expect(db.rows).toHaveLength(1);
  });

  it("returns the latest applied version, and its history, once staff have changed the line", async () => {
    const db = fakeVersionsDb();
    await currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER });
    const next = { ...config, unitCents: 119999 };
    db.rows.push({ id: "x2", shop: SHOP, orderId: ORDER, lineItemId: "gid://shopify/LineItem/1", version: 2, source: "staff", status: "applied", configuration: next, unitMinor: 119999, deltaMinor: 14000, reason: "Customer asked", actorId: "9", actorName: "Sam", createdAt: new Date() });
    db.rows.push({ id: "x3", shop: SHOP, orderId: ORDER, lineItemId: "gid://shopify/LineItem/1", version: 3, source: "staff", status: "failed", configuration: config, unitMinor: 112999, deltaMinor: -14000, reason: "oops", actorId: "9", actorName: "Sam", createdAt: new Date() });
    const out = (await currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER })).lines[0];
    expect(out.version).toBe(2);
    expect(out.configuration).toEqual(next);
    expect(out.unitMinor).toBe(119999);
    expect(out.history.map((h) => [h.version, h.status])).toEqual([[1, "applied"], [2, "applied"], [3, "failed"]]);
    expect(out.history[1]).toMatchObject({ actorName: "Sam", deltaMinor: 14000, reason: "Customer asked" });
  });

  it("a pending version blocks editing the line until it is settled", async () => {
    const db = fakeVersionsDb();
    await currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER });
    db.rows.push({ id: "p", shop: SHOP, orderId: ORDER, lineItemId: "gid://shopify/LineItem/1", version: 2, source: "staff", status: "pending", configuration: config, unitMinor: 1, deltaMinor: 1, createdAt: new Date() });
    const out = (await currentConfiguration(db, callWith([line()]), { shop: SHOP, orderId: ORDER })).lines[0];
    expect(out).toMatchObject({ editable: false, reason: "change_pending", version: 1 });
  });

  it("passes the configurator's reason for a line that is not editable, and creates no version for it", async () => {
    const db = fakeVersionsDb();
    const out = await currentConfiguration(db, callWith([line({ editable: false, reason: "order_cancelled" }), line({ lineItemId: "gid://shopify/LineItem/2", configuration: null, editable: false, reason: "not_configured" })]), { shop: SHOP, orderId: ORDER });
    expect(out.lines.map((l) => [l.editable, l.reason])).toEqual([[false, "order_cancelled"], [false, "not_configured"]]);
    expect(out.lines[1].version).toBeNull();
    expect(db.rows.map((r) => r.lineItemId)).toEqual(["gid://shopify/LineItem/1"]);
  });

  it("an order with no checkout snapshot gives no lines and the reason", async () => {
    const db = fakeVersionsDb();
    const call = async () => { throw new ConfiguratorError({ status: 404, code: "no_snapshot" }); };
    expect(await currentConfiguration(db, call, { shop: SHOP, orderId: ORDER })).toEqual({ lines: [], reason: "no_snapshot" });
    expect(db.rows).toHaveLength(0);
  });

  it("any other configurator failure is thrown for the route to report", async () => {
    const call = async () => { throw new ConfiguratorError({ status: 0, code: "timeout" }); };
    await expect(currentConfiguration(fakeVersionsDb(), call, { shop: SHOP, orderId: ORDER })).rejects.toMatchObject({ code: "timeout" });
  });
});
