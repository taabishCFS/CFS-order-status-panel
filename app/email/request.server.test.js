import { describe, expect, it } from "vitest";
import { readEmailRequest } from "./request.server";

const good = { orderId: "123", statusId: 3, lineIds: ["gid://shopify/LineItem/1"], idempotencyKey: "abc-1" };
const bad = (over) => readEmailRequest({ ...good, ...over });

describe("readEmailRequest", () => {
  it("accepts a status request and a template request", () => {
    expect(readEmailRequest(good).value).toMatchObject({ orderId: "gid://shopify/Order/123", statusId: 3, idempotencyKey: "abc-1" });
    const t = readEmailRequest({ ...good, statusId: undefined, templateKey: "tracking", extras: { trackingNumber: "T1" } });
    expect(t.value).toMatchObject({ templateKey: "tracking", extras: { trackingNumber: "T1" } });
  });

  it("refuses a bad order id, line id, or idempotency key", () => {
    for (const over of [{ orderId: "abc" }, { orderId: 5 }, { lineIds: ["1"] }, { lineIds: "x" }, { idempotencyKey: "" }, { idempotencyKey: "x".repeat(81) }, { idempotencyKey: undefined }]) {
      expect(bad(over).error).toBe("bad_request");
    }
  });

  it("needs exactly one of statusId and templateKey", () => {
    expect(bad({ templateKey: "tracking" }).error).toBe("bad_request");
    expect(bad({ statusId: undefined }).error).toBe("bad_request");
    expect(bad({ statusId: 1.5 }).error).toBe("bad_request");
    expect(bad({ statusId: undefined, templateKey: "Bad Key!" }).error).toBe("bad_request");
  });

  it("refuses more than 250 lines, and non-objects", () => {
    expect(bad({ lineIds: Array.from({ length: 251 }, (_, i) => `gid://shopify/LineItem/${i + 1}`) }).error).toBe("bad_request");
    for (const body of [null, [], "x", 5]) expect(readEmailRequest(body).error).toBe("bad_request");
  });

  it("checks the optional parts and drops unknown extras", () => {
    expect(bad({ previousStatusByLine: { "gid://shopify/LineItem/1": "x" } }).error).toBe("bad_request");
    expect(bad({ collectionLineIds: ["nope"] }).error).toBe("bad_request");
    expect(bad({ extras: { message: 5 } }).error).toBe("bad_request");
    expect(bad({ extras: { message: "x".repeat(5001) } }).error).toBe("bad_request");
    expect(bad({ extras: { evil: "x", reason: "R" } }).value.extras).toEqual({ reason: "R" });
  });
});
