import { describe, expect, it } from "vitest";
import { MESSAGES, withMessage } from "./error-messages.js";
import { MAX_DROPS as MAX_DROP } from "./delivery-rules.js";

describe("withMessage", () => {
  it("adds the sentence for a known refusal code", () => {
    expect(withMessage({ error: "no_permission" })).toEqual({ error: "no_permission", message: MESSAGES.no_permission });
  });
  it("keeps other fields, an existing message, and unknown codes as they are", () => {
    expect(withMessage({ error: "duplicate", duplicates: ["#1"] })).toEqual({ error: "duplicate", duplicates: ["#1"], message: MESSAGES.duplicate });
    expect(withMessage({ error: "bad_request", message: "mine" }).message).toBe("mine");
    expect(withMessage({ error: "weird" })).toEqual({ error: "weird" });
    expect(withMessage({ ok: true, saved: 1 })).toEqual({ ok: true, saved: 1 });
  });
  it("names the same drop limit the booking rules use", () => {
    expect(MESSAGES.drop_limit).toContain(String(MAX_DROP));
    expect(MESSAGES.bad_drop).toContain(String(MAX_DROP));
  });
});
