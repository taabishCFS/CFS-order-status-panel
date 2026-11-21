import { describe, expect, it } from "vitest";
import { readRefundInput, refundableMinor } from "./refund-request";

const good = { clientKey: "k1", reason: "DamagedPartRefund", type: "part", amount: "£1,250.5", lineIds: ["gid://shopify/LineItem/1"], notes: "  Leg snapped  " };

describe("readRefundInput", () => {
  it("accepts a request, turning the amount into pence and trimming the notes", () => {
    expect(readRefundInput(good).value).toEqual({ clientKey: "k1", reason: "DamagedPartRefund", type: "part", amountMinor: 125050, lineIds: ["gid://shopify/LineItem/1"], notes: "Leg snapped" });
  });

  it("lets a full refund leave the amount blank (the server fills in what is left)", () => {
    expect(readRefundInput({ ...good, type: "full", amount: "" }).value).toMatchObject({ type: "full", amountMinor: null });
  });

  it("refuses an unknown reason, an unknown type, a part refund with no amount, a bad amount, bad lines and over-long text", () => {
    expect(readRefundInput({ ...good, reason: "Nope" }).error).toBe("bad_reason");
    expect(readRefundInput({ ...good, type: "half" }).error).toBe("bad_type");
    expect(readRefundInput({ ...good, amount: "" }).error).toBe("bad_amount");
    for (const amount of ["0", "-5", "abc", "1.234", "12345678"]) expect(readRefundInput({ ...good, amount }).error).toBe("bad_amount");
    expect(readRefundInput({ ...good, lineIds: ["x"] }).error).toBe("bad_request");
    expect(readRefundInput({ ...good, notes: "x".repeat(1001) }).error).toBe("bad_request");
    expect(readRefundInput({ ...good, clientKey: "" }).error).toBe("bad_request");
    expect(readRefundInput(null).error).toBe("bad_request");
  });

  it("accepts the Delay Refund reason used by the 50% and 75% conditions", () => {
    expect(readRefundInput({ ...good, reason: "DelayRefund" }).error).toBeUndefined();
  });
});

describe("refundableMinor", () => {
  it("is the order total less what Shopify already refunded and what is already requested, never below zero", () => {
    expect(refundableMinor({ totalMinor: 10000, refundedMinor: 2000 }, 3000)).toBe(5000);
    expect(refundableMinor({ totalMinor: 10000, refundedMinor: 9000 }, 3000)).toBe(0);
  });
});
