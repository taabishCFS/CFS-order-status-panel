import { describe, expect, it } from "vitest";
import { isEmptyInvoice, readInvoiceInput } from "./supplier-invoice.js";

const L = "gid://shopify/LineItem/1";
const good = { lineId: L, invoiceDate: "2026-11-20", invoiceNumber: " INV-77 ", amount: "1,234.50", paid: true };

describe("readInvoiceInput", () => {
  it("reads a full invoice, trimming the number and turning the amount into pence", () => {
    expect(readInvoiceInput(good)).toEqual({ value: { lineId: L, invoiceDate: "2026-11-20", invoiceNumber: "INV-77", amountMinor: 123450, paid: true } });
  });

  it("treats blank date, number and amount as not set", () => {
    expect(readInvoiceInput({ lineId: L, invoiceDate: "", invoiceNumber: "  ", amount: "", paid: false }).value).toEqual({ lineId: L, invoiceDate: null, invoiceNumber: null, amountMinor: null, paid: false });
    expect(readInvoiceInput({ lineId: L, paid: false }).value).toMatchObject({ invoiceDate: null, invoiceNumber: null, amountMinor: null });
  });

  it("accepts a pound sign, spaces, whole pounds and one or two decimals", () => {
    const amount = (a) => readInvoiceInput({ ...good, amount: a }).value?.amountMinor;
    expect(amount("£50")).toBe(5000);
    expect(amount(" 12.5 ")).toBe(1250);
    expect(amount("0")).toBe(0);
    expect(amount("9999999.99")).toBe(999999999);
  });

  it("refuses bad amounts, dates, numbers, ids and paid values", () => {
    const bads = [
      { ...good, amount: "-5" }, { ...good, amount: "1.234" }, { ...good, amount: "abc" }, { ...good, amount: "10000000" },
      { ...good, invoiceDate: "20/11/2026" }, { ...good, invoiceDate: "2026-02-31" },
      { ...good, invoiceNumber: "x".repeat(61) },
      { ...good, lineId: "gid://shopify/Order/1" }, { ...good, lineId: undefined },
      { ...good, paid: "yes" }, { ...good, paid: undefined },
      null, [], "x",
    ];
    for (const b of bads) expect(readInvoiceInput(b)).toEqual({ error: "bad_request" });
  });
});

describe("isEmptyInvoice", () => {
  it("is empty only when nothing is set and it is not paid", () => {
    expect(isEmptyInvoice({ invoiceDate: null, invoiceNumber: null, amountMinor: null, paid: false })).toBe(true);
    expect(isEmptyInvoice({ invoiceDate: null, invoiceNumber: null, amountMinor: 0, paid: false })).toBe(false);
    expect(isEmptyInvoice({ invoiceDate: null, invoiceNumber: null, amountMinor: null, paid: true })).toBe(false);
  });
});
