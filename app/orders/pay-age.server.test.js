import { describe, expect, it } from "vitest";
import { invoiceAmounts, listPayAge, parsePayAgeParams, payAgeCsv } from "./pay-age.server.js";

const SHOP = "s.myshopify.com";
const L = (n) => `gid://shopify/LineItem/${n}`;
const O = (n) => `gid://shopify/Order/${n}`;
function makeDb(lines, orders, terms, payments = []) {
  const hit = (w = {}) => (r) => Object.entries(w).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in v) return v.in.includes(r[k]);
    if (v && typeof v === "object" && ("gt" in v || "gte" in v || "lte" in v)) return (v.gt === undefined || r[k] > v.gt) && (v.gte === undefined || r[k] >= v.gte) && (v.lte === undefined || r[k] <= v.lte);
    return r[k] === v;
  });
  return {
    orderLine: { findMany: async ({ where }) => lines.filter(hit(where)).sort((a, b) => b.orderCreatedAt - a.orderCreatedAt) },
    order: { findMany: async ({ where }) => orders.filter(hit(where)) },
    brandTerms: { findMany: async ({ where }) => terms.filter(([, t]) => t === where.terms).map(([brand, t]) => ({ brand, terms: t })) },
    lineSupplierInvoice: { findMany: async () => [] },
    linePayment: { findMany: async () => payments },
  };
}
const line = (n, extra = {}) => ({ shop: SHOP, orderId: O(n), lineId: L(n), vendor: "Pro", title: `Item ${n}`, variantTitle: null, sku: `C${n}`, variantId: null, quantity: 1, priceMinor: 1000, discountMinor: 0, lineStatusId: 3, stockedDate: null, orderCreatedAt: new Date(`2026-11-${10 + n}T10:00:00Z`), ...extra });
const order = (n, extra = {}) => ({ shop: SHOP, orderId: O(n), name: `#CFS${n}`, cancelledAt: null, ...extra });

describe("parameters and amounts", () => {
  it("reads the filters", () => {
    expect(parsePayAgeParams(new URLSearchParams("terms=credit&from=2026-11-30&to=2026-11-01&brand=A"))).toMatchObject({ terms: "credit", from: "2026-11-01", to: "2026-11-30", brand: "A" });
    expect(parsePayAgeParams(new URLSearchParams("terms=x&from=bad")).terms).toBe("proforma");
  });
  it("prefers the manual cost and adds 20% VAT", () => {
    expect(invoiceAmounts({ manualMinor: 1000, calculatedMinor: 5000 })).toEqual({ invoiceMinor: 1000, invoiceVatMinor: 1200 });
    expect(invoiceAmounts({ manualMinor: null, calculatedMinor: 5000 })).toEqual({ invoiceMinor: 5000, invoiceVatMinor: 6000 });
    expect(invoiceAmounts({ manualMinor: null, calculatedMinor: null })).toEqual({ invoiceMinor: null, invoiceVatMinor: null });
  });
});

describe("the reports", () => {
  const lines = [line(1), line(2, { lineStatusId: 12 }), line(3, { lineStatusId: 4 }), line(4, { vendor: "Cred", lineStatusId: 4 }), line(5, { vendor: "Cred", lineStatusId: 3 }), line(6), line(7, { vendor: "Nobody" })];
  const orders = [order(1), order(2), order(3), order(4), order(5), order(6, { cancelledAt: new Date() }), order(7)];
  const terms = [["Pro", "proforma"], ["Cred", "credit"]];
  it("proforma: pro-forma brands in status 3 or 12, newest first, cancelled left out", async () => {
    const r = await listPayAge(makeDb(lines, orders, terms, [{ lineId: L(1), manualCostMinor: 700 }]), undefined, SHOP, { terms: "proforma" });
    expect(r.rows.map((x) => x.lineId)).toEqual([L(2), L(1)]);
    expect(r.rows[1]).toMatchObject({ invoiceMinor: 700, invoiceVatMinor: 840 });
    expect(r.brands).toEqual(["Pro"]);
  });
  it("credit: credit brands in stock; dates and brand filter", async () => {
    const db = makeDb(lines, orders, terms);
    expect((await listPayAge(db, undefined, SHOP, { terms: "credit" })).rows.map((x) => x.lineId)).toEqual([L(4)]);
    expect((await listPayAge(db, undefined, SHOP, { terms: "credit", from: "2026-11-15" })).total).toBe(0);
    expect((await listPayAge(db, undefined, SHOP, { terms: "proforma", brand: "Cred" })).total).toBe(0);
  });
  it("says when no brand has terms set", async () => {
    expect(await listPayAge(makeDb(lines, orders, []), undefined, SHOP, { terms: "credit" })).toMatchObject({ total: 0, brandTermsSet: false });
  });
  it("downloads the page columns", async () => {
    const r = await listPayAge(makeDb(lines, orders, terms), undefined, SHOP, { terms: "credit" });
    expect(payAgeCsv(r.rows).split("\r\n").slice(0, 2)).toEqual(["﻿Order Date,Order No,Brand,Item,Product Code,Qty.,Invoice Amt.,Invoice+VAT Amt.,Status", "14/11/2026,CFS4,Cred,Item 4,C4,1,,,In Stock"]);
  });
});
