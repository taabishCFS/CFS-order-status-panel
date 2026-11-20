import { describe, expect, it } from "vitest";
import { applyConfiguration, previewChange, settlePending } from "./apply.server";
import { ConfiguratorError } from "./client.server";
import { fakeVersionsDb } from "./fixtures";
import { markerFor, OrderEditError } from "../orders/order-edit.server";

const SHOP = "a.myshopify.com";
const ORDER = "gid://shopify/Order/1";
const LINE = "gid://shopify/LineItem/20326782501203";
const staff = { id: "9", name: "Sam Patel" };
const NOW = 1_800_000_000_000;

const original = {
  baseCents: 99999,
  unitCents: 112999,
  options: [
    { group: "Select Drawer", label: "with 2 Drawer", cfsId: "17020886", assignmentId: "a1", quantity: 1, cents: 8999 },
    { group: "Select Fabric", label: "Carlton Caramel", cfsId: "17020903", assignmentId: "a2", quantity: 1, cents: 4001 },
  ],
};
const snapshotLine = (over = {}) => ({
  lineItemId: LINE, productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/8",
  title: "Natural Gold Bed", variantTitle: "2ft 6in", quantity: 2, unitCents: 112999, configuration: original, editable: true, ...over,
});
// The quote the engine gives for a selection: choice ids map to prices.
const PRICES = { 17020886: 8999, 17020903: 4001, 17020910: 18001, 17020920: 1000 };
const quoteFor = ({ choiceIds, quantities = {} }) => {
  const lines = choiceIds.map((id) => ({ choiceId: id, group: id === "17020886" ? "Select Drawer" : "Select Fabric", label: `Choice ${id}`, quantity: quantities[id] ?? 1, unitCents: PRICES[id], cents: PRICES[id] * (quantities[id] ?? 1) }));
  return { ok: true, baseCents: 99999, lines, totalCents: 99999 + lines.reduce((s, l) => s + l.cents, 0) };
};

function world({ lines = [snapshotLine()], orderState = {}, quote, editFails, findResult = false } = {}) {
  const db = fakeVersionsDb();
  const log = { call: [], edit: [], find: [] };
  const call = async (req) => {
    log.call.push(req.path);
    if (req.path.startsWith("/staff/order-lines")) return { ok: true, orderName: "#1", financialStatus: "PAID", cancelledAt: null, lines };
    if (req.path === "/staff/quote") {
      if (quote) return quote(req);
      return quoteFor(req.body);
    }
    throw new Error(`unexpected ${req.path}`);
  };
  const edit = {
    loadOrderState: async () => ({ currency: "GBP", cancelledAt: null, lines: { [LINE]: { quantity: 2, unfulfilledQuantity: 2 } }, ...orderState }),
    editOrder: async (_g, args) => {
      log.edit.push(args);
      if (editFails instanceof Error || editFails instanceof Response) throw editFails;
      if (editFails) throw new OrderEditError(editFails, "commit");
      return { adjustment: { kind: args.deltaMinor > 0 ? "custom_item" : "discount", amountMinor: Math.abs(args.deltaMinor), currency: args.currency } };
    },
    findEdit: async (_g, args) => { log.find.push(args.marker); return findResult; },
  };
  return { db, call, edit, log, graphql: {} };
}
const request = (w, over = {}) => ({
  db: w.db, graphql: w.graphql, call: w.call, edit: w.edit, staff, shop: SHOP, orderId: ORDER, lineItemId: LINE, expectedVersion: 1,
  choiceIds: ["17020886", "17020910"], quantities: {}, reason: "Customer asked", now: () => NOW, ...over,
});

describe("previewChange", () => {
  it("prices a new selection and gives the difference for the whole line", async () => {
    const w = world();
    const p = await previewChange({ db: w.db, call: w.call, shop: SHOP, orderId: ORDER, lineItemId: LINE, choiceIds: ["17020886", "17020910"], quantities: {} });
    expect(p).toMatchObject({ ok: true, version: 1, currentUnitMinor: 112999, newUnitMinor: 99999 + 8999 + 18001, deltaMinor: (99999 + 8999 + 18001 - 112999) * 2, same: false });
    expect(p.configuration.options.map((o) => o.cfsId)).toEqual(["17020886", "17020910"]);
  });

  it("is the same when the selection matches the current options", async () => {
    const w = world();
    const p = await previewChange({ db: w.db, call: w.call, shop: SHOP, orderId: ORDER, lineItemId: LINE, choiceIds: ["17020886", "17020903"], quantities: {} });
    expect(p).toMatchObject({ ok: true, same: true, deltaMinor: 0 });
  });

  it("passes the engine's refusal on as invalid, with its code", async () => {
    const w = world({ quote: async () => { throw new ConfiguratorError({ status: 422, code: "invalid_combination", body: { ok: false, errors: [{ code: "invalid_combination" }] } }); } });
    expect(await previewChange({ db: w.db, call: w.call, shop: SHOP, orderId: ORDER, lineItemId: LINE, choiceIds: ["1"], quantities: {} })).toEqual({ ok: false, outcome: "invalid", message: "invalid_combination" });
  });

  it("uses the product and variant of the saved line, never ones from the caller", async () => {
    const w = world();
    let sent;
    const call = async (req) => { if (req.path === "/staff/quote") sent = req.body; return w.call(req); };
    await previewChange({ db: w.db, call, shop: SHOP, orderId: ORDER, lineItemId: LINE, choiceIds: ["17020886"], quantities: {}, productId: "evil", variantId: "evil" });
    expect(sent).toEqual({ productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/8", choiceIds: ["17020886"], quantities: {} });
  });

  it("a line that is missing or not editable is not_editable with the reason", async () => {
    const w = world({ lines: [snapshotLine({ editable: false, reason: "order_cancelled" })] });
    expect(await previewChange({ db: w.db, call: w.call, shop: SHOP, orderId: ORDER, lineItemId: LINE, choiceIds: [], quantities: {} })).toEqual({ ok: false, outcome: "not_editable", message: "order_cancelled" });
    expect(await previewChange({ db: w.db, call: w.call, shop: SHOP, orderId: ORDER, lineItemId: "gid://shopify/LineItem/2", choiceIds: [], quantities: {} })).toMatchObject({ outcome: "not_editable", message: "line_not_found" });
  });
});

describe("applyConfiguration", () => {
  it("an increase: saves pending first, posts a custom item for the whole-line difference, then marks applied", async () => {
    const w = world();
    const states = [];
    const editOrder = w.edit.editOrder;
    w.edit.editOrder = async (g, a) => { states.push(w.db.rows.map((r) => `${r.version}:${r.status}`)); return editOrder(g, a); };
    const out = await applyConfiguration(request(w));
    expect(states).toEqual([["1:applied", "2:pending"]]);
    const delta = (99999 + 8999 + 18001 - 112999) * 2;
    expect(out).toEqual({ outcome: "applied", version: 2, deltaMinor: delta });
    expect(w.log.edit).toHaveLength(1);
    expect(w.log.edit[0]).toMatchObject({ orderId: ORDER, lineItemId: LINE, lineQuantity: 2, deltaMinor: delta, currency: "GBP", marker: markerFor(LINE, 2) });
    expect(w.log.edit[0].note).toContain("Sam Patel");
    expect(w.log.edit[0].note).toContain("Customer asked");
    expect(w.db.rows[1]).toMatchObject({ version: 2, source: "staff", status: "applied", deltaMinor: delta, unitMinor: 99999 + 8999 + 18001, reason: "Customer asked", actorId: "9", actorName: "Sam Patel", adjustment: { kind: "custom_item", amountMinor: delta, currency: "GBP" } });
  });

  it("a decrease posts a discount", async () => {
    const w = world();
    const out = await applyConfiguration(request(w, { choiceIds: ["17020886", "17020920"] }));
    expect(out.outcome).toBe("applied");
    expect(out.deltaMinor).toBeLessThan(0);
    expect(w.db.rows[1].adjustment.kind).toBe("discount");
  });

  it("an identical selection is unchanged: nothing saved, nothing posted", async () => {
    const w = world();
    const out = await applyConfiguration(request(w, { choiceIds: ["17020886", "17020903"] }));
    expect(out).toEqual({ outcome: "unchanged" });
    expect(w.db.rows).toHaveLength(1);
    expect(w.log.edit).toHaveLength(0);
  });

  it("different options at the same price are saved as a version with no Shopify change", async () => {
    PRICES[17020999] = 4001;
    const w = world();
    const out = await applyConfiguration(request(w, { choiceIds: ["17020886", "17020999"] }));
    delete PRICES[17020999];
    expect(out).toEqual({ outcome: "applied", version: 2, deltaMinor: 0 });
    expect(w.log.edit).toHaveLength(0);
    expect(w.db.rows[1]).toMatchObject({ status: "applied", deltaMinor: 0, adjustment: null });
  });

  it("a stale expectedVersion is refused and nothing is posted", async () => {
    const w = world();
    const out = await applyConfiguration(request(w, { expectedVersion: 0 }));
    expect(out.outcome).toBe("stale");
    expect(w.log.edit).toHaveLength(0);
    expect(w.db.rows).toHaveLength(1);
  });

  it("the same request sent twice posts once; the second is stale", async () => {
    const w = world();
    const first = await applyConfiguration(request(w));
    const second = await applyConfiguration(request(w));
    expect([first.outcome, second.outcome]).toEqual(["applied", "stale"]);
    expect(w.log.edit).toHaveLength(1);
    expect(w.db.rows.filter((r) => r.source === "staff")).toHaveLength(1);
  });

  it("two requests at the same moment post once", async () => {
    const w = world();
    const outcomes = (await Promise.all([applyConfiguration(request(w)), applyConfiguration(request(w))])).map((o) => o.outcome);
    expect(outcomes.filter((o) => o === "applied")).toHaveLength(1);
    expect(["stale", "not_editable"]).toContain(outcomes.find((o) => o !== "applied"));
    expect(w.log.edit).toHaveLength(1);
  });

  it("an invalid selection is invalid with the engine's code, and nothing is saved or posted", async () => {
    const w = world({ quote: async () => { throw new ConfiguratorError({ status: 422, code: "missing_required_group", body: {} }); } });
    expect(await applyConfiguration(request(w))).toEqual({ outcome: "invalid", message: "missing_required_group" });
    expect(w.db.rows).toHaveLength(1);
    expect(w.log.edit).toHaveLength(0);
  });

  it("a reason is required", async () => {
    const w = world();
    expect(await applyConfiguration(request(w, { reason: "   " }))).toEqual({ outcome: "invalid", message: "reason_required" });
    expect(w.log.edit).toHaveLength(0);
  });

  it("a cancelled order or a fulfilled line is not_editable and nothing is posted", async () => {
    for (const [orderState, message] of [
      [{ cancelledAt: "2026-11-20T00:00:00Z" }, "order_cancelled"],
      [{ lines: { [LINE]: { quantity: 2, unfulfilledQuantity: 1 } } }, "line_fulfilled"],
    ]) {
      const w = world({ orderState });
      expect(await applyConfiguration(request(w))).toEqual({ outcome: "not_editable", message });
      expect(w.log.edit).toHaveLength(0);
      expect(w.db.rows).toHaveLength(1);
    }
  });

  it("a Shopify failure marks the version failed with the error and leaves the line editable", async () => {
    const w = world({ editFails: "Order changed" });
    const out = await applyConfiguration(request(w));
    expect(out).toEqual({ outcome: "failed", message: "Order changed" });
    expect(w.db.rows[1]).toMatchObject({ version: 2, status: "failed", reason: "Customer asked" });
    expect(w.db.rows[1].adjustment).toEqual({ error: "Order changed" });
    const retry = await previewChange({ db: w.db, call: w.call, shop: SHOP, orderId: ORDER, lineItemId: LINE, choiceIds: ["17020886", "17020910"], quantities: {} });
    expect(retry).toMatchObject({ ok: true, version: 1 });
  });

  it("an HTTP refusal from Shopify (for example a missing access scope) is recorded with its status", async () => {
    const w = world({ editFails: new Response("denied", { status: 403 }) });
    const out = await applyConfiguration(request(w));
    expect(out).toEqual({ outcome: "failed", message: "Shopify edit failed (HTTP 403)" });
    expect(w.db.rows[1].adjustment).toEqual({ error: "Shopify edit failed (HTTP 403)" });
  });

  it("the next attempt after a failed one uses the next free version number", async () => {
    const w = world({ editFails: "Order changed" });
    await applyConfiguration(request(w));
    w.edit.editOrder = async (_g, a) => ({ adjustment: { kind: "custom_item", amountMinor: a.deltaMinor, currency: "GBP" } });
    const out = await applyConfiguration(request(w));
    expect(out).toMatchObject({ outcome: "applied", version: 3 });
  });

  it("Shopify committed but saving 'applied' failed: reports applied, and the pending row settles later", async () => {
    const w = world();
    const update = w.db.lineConfiguration.update;
    let calls = 0;
    w.db.lineConfiguration.update = async (a) => { calls += 1; if (calls === 1) throw new Error("database unavailable"); return update(a); };
    const out = await applyConfiguration(request(w));
    expect(out).toMatchObject({ outcome: "applied", version: 2, warning: "record_pending" });
    expect(w.db.rows[1].status).toBe("pending");
    expect(w.log.edit).toHaveLength(1);

    const later = { ...request(w), now: () => NOW + 5 * 60 * 1000 };
    w.edit.findEdit = async (_g, a) => { w.log.find.push(a.marker); return true; };
    await settlePending({ db: w.db, graphql: w.graphql, shop: SHOP, orderId: ORDER, edit: w.edit, now: later.now });
    expect(w.db.rows[1].status).toBe("applied");
    expect(w.log.find).toEqual([markerFor(LINE, 2)]);
    expect(w.log.edit).toHaveLength(1);
  });

  it("a configurator outage is failed with its code, and nothing changes", async () => {
    const w = world();
    const call = async () => { throw new ConfiguratorError({ status: 0, code: "timeout" }); };
    expect(await applyConfiguration(request(w, { call }))).toEqual({ outcome: "failed", message: "configurator_timeout" });
    expect(w.db.rows).toHaveLength(0);
  });
});

describe("settlePending", () => {
  const pendingRow = (w, createdAt) => w.db.rows.push({ id: "p1", shop: SHOP, orderId: ORDER, lineItemId: LINE, version: 2, source: "staff", status: "pending", configuration: original, unitMinor: 1, deltaMinor: 5, createdAt: new Date(createdAt), reason: "x", actorId: "9", actorName: "Sam", adjustment: null });
  const settle = (w, over = {}) => settlePending({ db: w.db, graphql: w.graphql, shop: SHOP, orderId: ORDER, edit: w.edit, now: () => NOW, ...over });

  it("leaves a pending change alone while it is under a minute old (another request may be mid-save)", async () => {
    const w = world(); pendingRow(w, NOW - 30_000);
    await settle(w);
    expect(w.db.rows[0].status).toBe("pending");
    expect(w.log.find).toHaveLength(0);
  });

  it("marks an old pending change applied when Shopify has its marker", async () => {
    const w = world({ findResult: true }); pendingRow(w, NOW - 120_000);
    await settle(w);
    expect(w.db.rows[0].status).toBe("applied");
  });

  it("marks an old pending change failed when Shopify has no marker", async () => {
    const w = world({ findResult: false }); pendingRow(w, NOW - 120_000);
    await settle(w);
    expect(w.db.rows[0]).toMatchObject({ status: "failed" });
    expect(w.db.rows[0].adjustment.error).toContain("not applied");
    expect(w.db.rows[0].reason).toBe("x");
  });

  it("changes nothing when Shopify cannot be read", async () => {
    const w = world(); pendingRow(w, NOW - 120_000);
    w.edit.findEdit = async () => { throw new OrderEditError("Throttled", "find"); };
    await settle(w);
    expect(w.db.rows[0].status).toBe("pending");
  });
});
