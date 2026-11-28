import { describe, expect, it } from "vitest";
import { listPayments, parsePaymentParams, paymentSearch, toPaymentRow } from "./payment-history.server.js";

describe("Payment History", () => {
  it("reads the page parameters and drops bad ones", () => {
    expect(parsePaymentParams(new URLSearchParams("from=2026-11-01&to=2026-11-30&after=abc="))).toEqual({ from: "2026-11-01", to: "2026-11-30", after: "abc=", before: "" });
    expect(parsePaymentParams(new URLSearchParams("from=01/11/2026&to=2026-13-45&before=x y"))).toEqual({ from: "", to: "", after: "", before: "" });
  });
  it("searches whole days", () => {
    expect(paymentSearch({ from: "2026-11-01", to: "2026-11-30" })).toBe("processed_at:>=2026-11-01 processed_at:<2026-12-01");
    expect(paymentSearch({ from: "", to: "" })).toBe("");
  });
  it("turns a transaction into a row; a negative amount is a refund", () => {
    const t = { id: "T1", processedAt: "2026-11-18T10:21:13Z", paymentMethod: "credit_card", remoteReference: "53433", test: true, amount: { amount: "-20.0", currencyCode: "GBP" }, order: { id: "gid://shopify/Order/1", name: "#1036", email: "a@b.co", billingAddress: null, shippingAddress: { name: "Stonage" } } };
    expect(toPaymentRow(t)).toEqual({ id: "T1", orderId: "gid://shopify/Order/1", orderName: "1036", reference: "53433", type: "Refund", amountMinor: -2000, currency: "GBP", payType: "Card", email: "a@b.co", customer: "Stonage", date: "2026-11-18T10:21:13Z", test: true });
    expect(toPaymentRow({ id: "T2", amount: { amount: "5", currencyCode: "GBP" }, paymentMethod: "bank_deposit", order: null })).toMatchObject({ type: "Payment", orderId: null, payType: "Bank deposit" });
  });
  it("asks Shopify for the right page and passes the cursors back", async () => {
    const calls = [];
    const graphql = async (_q, { variables }) => {
      calls.push(variables);
      return { json: async () => ({ data: { tenderTransactions: { nodes: [], pageInfo: { hasNextPage: true, hasPreviousPage: false, startCursor: "s", endCursor: "e" } } } }) };
    };
    expect(await listPayments(graphql, { from: "2026-11-01", to: "", after: "", before: "" })).toEqual({ rows: [], hasNext: true, hasPrevious: false, next: "e", previous: null, size: 50 });
    expect(calls[0]).toEqual({ query: "processed_at:>=2026-11-01", first: 50, after: null });
    await listPayments(graphql, { from: "", to: "", after: "", before: "b" });
    expect(calls[1]).toEqual({ query: null, last: 50, before: "b" });
  });
  it("reports Shopify errors", async () => {
    const graphql = async () => ({ json: async () => ({ errors: [{ message: "Access denied" }] }) });
    await expect(listPayments(graphql, { from: "", to: "", after: "", before: "" })).rejects.toThrow("Access denied");
  });
});
