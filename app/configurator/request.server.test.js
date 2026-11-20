import { describe, expect, it } from "vitest";
import { readChange, statusFor } from "./request.server";

const good = { orderId: "123", lineItemId: "gid://shopify/LineItem/45", choiceIds: ["17020886", "217067"], quantities: { 217067: 2 }, expectedVersion: 3, reason: "Asked" };

describe("readChange", () => {
  it("accepts a good body and turns the order id into a gid", () => {
    expect(readChange(good)).toEqual({ value: { orderId: "gid://shopify/Order/123", lineItemId: "gid://shopify/LineItem/45", choiceIds: ["17020886", "217067"], quantities: { 217067: 2 }, expectedVersion: 3, reason: "Asked" } });
  });

  it("defaults quantities, a missing version and a missing reason", () => {
    const { value } = readChange({ orderId: "1", lineItemId: "gid://shopify/LineItem/2", choiceIds: [] });
    expect(value).toMatchObject({ quantities: {}, expectedVersion: null, reason: "" });
  });

  it("refuses anything malformed", () => {
    const bad = [
      null, "x", [], {},
      { ...good, orderId: "gid://shopify/Order/1" }, { ...good, orderId: 5 }, { ...good, orderId: "1; drop" },
      { ...good, lineItemId: "45" }, { ...good, lineItemId: "gid://shopify/Order/45" },
      { ...good, choiceIds: "17020886" }, { ...good, choiceIds: [1] }, { ...good, choiceIds: ["a b"] }, { ...good, choiceIds: ["1", "1"] },
      { ...good, choiceIds: Array.from({ length: 61 }, (_, i) => String(i)) },
      { ...good, quantities: [] }, { ...good, quantities: { 217067: 0 } }, { ...good, quantities: { 217067: 1.5 } }, { ...good, quantities: { 217067: "2" } }, { ...good, quantities: { 217067: 1000 } },
    ];
    for (const body of bad) expect(readChange(body)).toEqual({ error: "bad_request" });
  });

  it("ignores a non-integer version and cuts a very long reason", () => {
    expect(readChange({ ...good, expectedVersion: "3" }).value.expectedVersion).toBeNull();
    expect(readChange({ ...good, reason: "x".repeat(900) }).value.reason).toHaveLength(500);
  });
});

describe("statusFor", () => {
  it("maps each outcome", () => {
    expect(["applied", "unchanged", "stale", "not_editable", "invalid", "failed"].map(statusFor)).toEqual([200, 200, 409, 409, 422, 502]);
  });
});
