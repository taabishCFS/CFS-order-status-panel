import { describe, expect, it, vi } from "vitest";
import { deliveryNoteLog, loadDocument, logDeliveryNote } from "./documents.server";

const money = (a) => ({ shopMoney: { amount: a, currencyCode: "GBP" } });
const order = { name: "#5", createdAt: "2026-11-22T10:00:00Z", tags: ["site:TFS"], currentTotalPriceSet: money("10.0"), totalReceivedSet: money("10.0"), totalOutstandingSet: money("0.0"), lineItems: { nodes: [] }, metafield: null };
const gql = (body) => vi.fn(async () => ({ json: async () => body }));

describe("loadDocument", () => {
  it("shapes the order and picks the site from its tag", async () => {
    const db = { emailSite: { findUnique: vi.fn(async () => ({ name: "The Furnshop", url: "u", serviceEmail: "e", phone: "p", logoUrl: "" })) } };
    const out = await loadDocument(gql({ data: { order } }), db, { shop: "s", orderId: "gid://shopify/Order/5" });
    expect(out.doc.name).toBe("#5");
    expect(out.site.name).toBe("The Furnshop");
    expect(db.emailSite.findUnique.mock.calls[0][0]).toEqual({ where: { shop_code: { shop: "s", code: "TFS" } } });
  });
  it("returns null for a missing order and throws on a Shopify error", async () => {
    expect(await loadDocument(gql({ data: { order: null } }), {}, { shop: "s", orderId: "x" })).toBeNull();
    await expect(loadDocument(gql({ errors: [{ message: "Throttled" }] }), {}, { shop: "s", orderId: "x" })).rejects.toThrow("Throttled");
  });
});

describe("delivery notes log", () => {
  it("records who opened the note and lists newest first", async () => {
    const db = {
      deliveryNotePrint: {
        create: vi.fn(async () => ({})),
        findMany: vi.fn(async () => [{ printedAt: new Date("2026-11-22T10:00:00Z"), printedBy: "Ann" }]),
      },
    };
    await logDeliveryNote(db, { shop: "s", orderId: "o", staff: { id: "9", name: "Sam" } });
    expect(db.deliveryNotePrint.create.mock.calls[0][0].data).toEqual({ shop: "s", orderId: "o", printedById: "9", printedBy: "Sam" });
    expect(await deliveryNoteLog(db, { shop: "s", orderId: "o" })).toEqual([{ at: "2026-11-22T10:00:00.000Z", by: "Ann" }]);
    expect(db.deliveryNotePrint.findMany.mock.calls[0][0].orderBy).toEqual({ printedAt: "desc" });
  });
});
