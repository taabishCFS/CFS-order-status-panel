import { describe, expect, it, vi } from "vitest";
import { getSupplierInvoices, saveSupplierInvoice } from "./supplier-invoice.server.js";

const SHOP = "s.myshopify.com";
const ORDER = "gid://shopify/Order/1";
const L = (n) => `gid://shopify/LineItem/${n}`;
const actor = { id: "9", name: "Sam Patel" };
const input = (over = {}) => ({ lineId: L(1), invoiceDate: "2026-11-20", invoiceNumber: "INV-77", amountMinor: 123450, paid: true, ...over });

function fakeDb({ lineExists = true, rows = [] } = {}) {
  return {
    orderLine: { findFirst: vi.fn(async () => (lineExists ? { lineId: L(1) } : null)) },
    lineSupplierInvoice: {
      findMany: vi.fn(async () => rows),
      upsert: vi.fn(async ({ create }) => ({ ...create, updatedAt: new Date("2026-11-20T10:00:00Z") })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("getSupplierInvoices", () => {
  it("returns the saved invoices of the order keyed by line id", async () => {
    const db = fakeDb({ rows: [{ lineId: L(1), invoiceDate: "2026-11-20", invoiceNumber: "INV-77", amountMinor: 500, paid: false, updatedByName: "Sam Patel", updatedAt: new Date("2026-11-20T10:00:00Z") }] });
    const res = await getSupplierInvoices(db, SHOP, ORDER);
    expect(db.lineSupplierInvoice.findMany.mock.calls[0][0].where).toEqual({ shop: SHOP, orderId: ORDER });
    expect(res).toEqual({ [L(1)]: { invoiceDate: "2026-11-20", invoiceNumber: "INV-77", amountMinor: 500, paid: false, updatedByName: "Sam Patel", updatedAt: "2026-11-20T10:00:00.000Z" } });
  });
});

describe("saveSupplierInvoice", () => {
  it("saves the invoice for a line of this order, recording who saved it", async () => {
    const db = fakeDb();
    const res = await saveSupplierInvoice(db, { shop: SHOP, orderId: ORDER, input: input(), actor });
    expect(db.orderLine.findFirst.mock.calls[0][0].where).toEqual({ shop: SHOP, orderId: ORDER, lineId: L(1) });
    const args = db.lineSupplierInvoice.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ shop_lineId: { shop: SHOP, lineId: L(1) } });
    expect(args.create).toMatchObject({ shop: SHOP, orderId: ORDER, lineId: L(1), invoiceDate: "2026-11-20", invoiceNumber: "INV-77", amountMinor: 123450, paid: true, updatedById: "9", updatedByName: "Sam Patel" });
    expect(args.update).not.toHaveProperty("shop");
    expect(res).toMatchObject({ ok: true, invoice: { invoiceNumber: "INV-77", paid: true, updatedByName: "Sam Patel" } });
  });

  it("clears the record when everything is blank and not paid", async () => {
    const db = fakeDb();
    const res = await saveSupplierInvoice(db, { shop: SHOP, orderId: ORDER, input: input({ invoiceDate: null, invoiceNumber: null, amountMinor: null, paid: false }), actor });
    expect(db.lineSupplierInvoice.deleteMany.mock.calls[0][0].where).toEqual({ shop: SHOP, lineId: L(1) });
    expect(db.lineSupplierInvoice.upsert).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, invoice: null });
  });

  it("refuses a line that is not on this order", async () => {
    const db = fakeDb({ lineExists: false });
    expect(await saveSupplierInvoice(db, { shop: SHOP, orderId: ORDER, input: input(), actor })).toEqual({ ok: false, code: "no_line" });
    expect(db.lineSupplierInvoice.upsert).not.toHaveBeenCalled();
  });
});
