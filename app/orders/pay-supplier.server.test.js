import { beforeEach, describe, expect, it } from "vitest";
import { costsOf, listPayable, needsPaying, parsePayParams, payCsv, payRowsFor, poundsToMinor, readPayInput, saveCost, saveInvoiceNumber, setPaid } from "./pay-supplier.server.js";

const SHOP = "s.myshopify.com";
const L = (n) => `gid://shopify/LineItem/${n}`;
const O = (n) => `gid://shopify/Order/${n}`;

function makeDb({ lines, orders, terms = [], minerva = [] }) {
  const minervaPaid = [];
  const invoices = [];
  const payments = [];
  const matcher = (w = {}) => (r) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "in" in v ? v.in.includes(r[k]) : v && typeof v === "object" && "gt" in v ? r[k] > v.gt : r[k] === v));
  const table = (rows, key = "lineId") => ({
    findMany: async ({ where } = {}) => rows.filter(matcher(where)).map((r) => ({ ...r })),
    upsert: async ({ where, create, update }) => {
      const hit = rows.find((r) => r[key] === where.shop_lineId.lineId);
      if (hit) Object.assign(hit, update);
      else rows.push({ ...create });
    },
  });
  return {
    invoices, payments,
    orderLine: { findMany: async ({ where }) => lines.filter(matcher(where)), findFirst: async ({ where }) => lines.find(matcher(where)) ?? null },
    order: { findMany: async ({ where }) => orders.filter(matcher(where)) },
    brandTerms: { findMany: async () => terms.map(([brand, t]) => ({ brand, terms: t })) },
    lineSupplierInvoice: table(invoices),
    linePayment: table(payments),
    minervaBrand: { findMany: async () => minerva },
    minervaPayment: { rows: minervaPaid, upsert: async ({ create }) => { minervaPaid.push(create); }, deleteMany: async ({ where }) => { const n = minervaPaid.length; minervaPaid.splice(0, n, ...minervaPaid.filter((r) => !where.lineId.in.includes(r.lineId))); return { count: n - minervaPaid.length }; } },
  };
}
const line = (n, extra = {}) => ({ shop: SHOP, orderId: O(1), lineId: L(n), vendor: "Duke Beds", title: `Bed ${n}`, variantTitle: null, sku: `S${n}`, variantId: null, quantity: 2, priceMinor: 10000, discountMinor: 500, lineStatusId: 4, stockedDate: null, orderCreatedAt: new Date("2026-11-20T10:00:00Z"), ...extra });
const order = (n, extra = {}) => ({ shop: SHOP, orderId: O(n), name: `#CFS${n}`, cancelledAt: null, ...extra });

describe("amounts", () => {
  it("reads pounds, blank clears, rubbish is refused", () => {
    expect(poundsToMinor("12.5")).toBe(1250);
    expect(poundsToMinor("£3")).toBe(300);
    expect(poundsToMinor("  ")).toBeNull();
    expect(poundsToMinor("-1")).toBeUndefined();
    expect(poundsToMinor("1.234")).toBeUndefined();
  });
  it("uses the manual cost when there is one, then adds DHD", () => {
    expect(costsOf({ unitCostMinor: 1000, quantity: 2, manualMinor: null, dhdMinor: null })).toEqual({ calculatedMinor: 2000, finalMinor: 2000, diffMinor: null });
    expect(costsOf({ unitCostMinor: 1000, quantity: 2, manualMinor: 1800, dhdMinor: 300 })).toEqual({ calculatedMinor: 2000, finalMinor: 2100, diffMinor: 200 });
    expect(costsOf({ unitCostMinor: null, quantity: 2, manualMinor: null, dhdMinor: 300 })).toEqual({ calculatedMinor: null, finalMinor: null, diffMinor: null });
    expect(costsOf({ unitCostMinor: null, quantity: 2, manualMinor: 500, dhdMinor: null }).finalMinor).toBe(500);
  });
});

describe("which statuses need paying", () => {
  it("is narrower for pro-forma brands", () => {
    expect(needsPaying("proforma", 4)).toBe(false);
    expect(needsPaying("credit", 4)).toBe(true);
    expect(needsPaying(undefined, 4)).toBe(true);
    expect(needsPaying("proforma", 12)).toBe(true);
    expect(needsPaying("credit", 13)).toBe(false);
  });
});

describe("reading requests", () => {
  it("checks each operation", () => {
    expect(readPayInput({ op: "manual", lineId: L(1), value: "5" })).toEqual({ value: { op: "manual", lineId: L(1), minor: 500 } });
    expect(readPayInput({ op: "dhd", lineId: L(1), value: "x" })).toEqual({ error: "bad_amount" });
    expect(readPayInput({ op: "invoice", lineId: L(1), value: " INV1 " })).toEqual({ value: { op: "invoice", lineId: L(1), invoiceNumber: "INV1" } });
    expect(readPayInput({ op: "paid", paid: true, lineIds: [] })).toEqual({ error: "nothing_selected" });
    expect(readPayInput({ op: "paid", paid: true, lineIds: [L(1), L(1), "bad"] })).toEqual({ value: { op: "paid", lineIds: [L(1)], paid: true } });
    expect(readPayInput({ op: "manual", lineId: "bad", value: "1" })).toEqual({ error: "bad_request" });
    expect(parsePayParams(new URLSearchParams("paid=1&brand=A&q=%23CFS1&page=2"))).toMatchObject({ paid: true, brand: "A", q: "CFS1", page: 2, all: false });
  });
});

describe("the unpaid list", () => {
  let db;
  beforeEach(() => {
    db = makeDb({
      lines: [line(1), line(2, { vendor: "Pro Co", lineStatusId: 4, orderId: O(2) }), line(3, { orderId: O(3) }), line(4, { lineStatusId: 13 }), line(5, { orderId: O(4) })],
      orders: [order(1), order(2), order(3, { cancelledAt: new Date() }), order(4)],
      terms: [["Pro Co", "proforma"]],
    });
  });
  it("leaves out pro-forma lines in other statuses, cancelled orders, paid and finished statuses", async () => {
    await setPaid(db, SHOP, [L(5)], true, { name: "A" });
    const r = await listPayable(db, undefined, SHOP, {});
    expect(r.rows.map((x) => x.lineId)).toEqual([L(1)]);
    expect(r.brands).toEqual(["Duke Beds"]);
  });
  it("filters by brand and order number and totals the costs shown", async () => {
    await saveCost(db, SHOP, { op: "manual", lineId: L(1), minor: 1500 }, { name: "A" });
    await saveCost(db, SHOP, { op: "dhd", lineId: L(1), minor: 250 }, { name: "A" });
    const r = await listPayable(db, undefined, SHOP, { q: "cfs1", brand: "Duke Beds" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ manualMinor: 1500, dhdMinor: 250, finalMinor: 1750, orderName: "CFS1", saleMinor: 19500 });
    expect(r.pageTotalMinor).toBe(1750);
    expect((await listPayable(db, undefined, SHOP, { brand: "Nope" })).rows).toEqual([]);
  });
});

describe("paying", () => {
  it("marks paid with a date and moves lines to the paid list, and back", async () => {
    const db = makeDb({ lines: [line(1)], orders: [order(1)] });
    await saveInvoiceNumber(db, SHOP, { lineId: L(1), invoiceNumber: "INV-9" }, { id: "u", name: "A" });
    expect(await setPaid(db, SHOP, [L(1), L(99)], true, { id: "u", name: "A" }, new Date("2026-11-26T09:00:00Z"))).toEqual({ ok: true, changed: 1 });
    expect((await listPayable(db, undefined, SHOP, {})).rows).toEqual([]);
    const paid = await listPayable(db, undefined, SHOP, { paid: true });
    expect(paid.rows[0]).toMatchObject({ lineId: L(1), invoiceNumber: "INV-9", paid: true });
    expect(paid.rows[0].paidAt.toISOString()).toBe("2026-11-26T09:00:00.000Z");
    await setPaid(db, SHOP, [L(1)], false, { name: "A" });
    expect((await listPayable(db, undefined, SHOP, {})).rows).toHaveLength(1);
    expect((await listPayable(db, undefined, SHOP, { paid: true })).rows).toEqual([]);
  });
  it("records a Minerva brand's paid line for the Minerva report, and takes it off on Not Paid", async () => {
    const db = makeDb({ lines: [line(1), line(2, { vendor: "Other" })], orders: [order(1)], minerva: [{ shop: SHOP, brand: "Duke Beds", discHundredths: 500, fromDate: "2026-01-01", toDate: "2026-12-31" }] });
    await saveCost(db, SHOP, { op: "manual", lineId: L(1), minor: 8000 }, { name: "A" });
    await setPaid(db, SHOP, [L(1), L(2)], true, { name: "A" }, new Date("2026-11-26T09:00:00Z"));
    expect(db.minervaPayment.rows).toEqual([expect.objectContaining({ lineId: L(1), brand: "Duke Beds", paidMinor: 8000, discHundredths: 500 })]);
    await setPaid(db, SHOP, [L(1)], false, { name: "A" });
    expect(db.minervaPayment.rows).toEqual([]);
  });
  it("refuses an unknown line", async () => {
    const db = makeDb({ lines: [], orders: [] });
    expect(await saveCost(db, SHOP, { op: "manual", lineId: L(1), minor: 1 })).toEqual({ ok: false, code: "no_line" });
    expect(await saveInvoiceNumber(db, SHOP, { lineId: L(1), invoiceNumber: "x" })).toEqual({ ok: false, code: "no_line" });
  });
});

describe("the download", () => {
  it("has the old columns for the ticked lines", async () => {
    const db = makeDb({ lines: [line(1)], orders: [order(1)] });
    const rows = await payRowsFor(db, undefined, SHOP, [L(1)]);
    const csv = payCsv(rows).split("\r\n");
    expect(csv[0]).toBe("﻿Order Date,Order No,Brand,Product Details,Product Code,Qty,Product Cost,Manual Cost,DHD Cost,Final Cost,Invoice No.,Batch Invoice No.,Payment Date,IN Stock Date,Order Status,Payment Status");
    expect(csv[1]).toBe("20/11/2026,CFS1,Duke Beds,Bed 1,S1,2,,,,,,,,,In Stock,Not Paid");
  });
});
