import { describe, expect, it } from "vitest";
import { signExportLink, verifyExportLink } from "./export-link.server.js";

const secret = "test-secret";
const now = 1_800_000_000_000;
const payload = { shop: "s.myshopify.com", kind: 3, query: "brand=Actona&from=2026-11-01" };

describe("export links", () => {
  it("round-trips the shop, kind and filters", () => {
    const token = signExportLink(payload, secret, now);
    expect(verifyExportLink(token, secret, now + 1000)).toEqual({ ok: true, ...payload });
  });

  it("expires after five minutes", () => {
    const token = signExportLink(payload, secret, now);
    expect(verifyExportLink(token, secret, now + 5 * 60_000 - 1).ok).toBe(true);
    expect(verifyExportLink(token, secret, now + 5 * 60_000 + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyExportLink(signExportLink(payload, "other", now), secret, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token whose filters were changed", () => {
    const [body, sig] = signExportLink(payload, secret, now).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, query: "brand=Other", exp: now + 1000 })).toString("base64url");
    expect(forged).not.toBe(body);
    expect(verifyExportLink(`${forged}.${sig}`, secret, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects junk and a missing secret", () => {
    for (const t of ["", "abc", "a.b.c", null, undefined, 5]) expect(verifyExportLink(t, secret, now).ok).toBe(false);
    expect(() => signExportLink(payload, "", now)).toThrow();
    expect(verifyExportLink(signExportLink(payload, secret, now), "", now).ok).toBe(false);
  });
});
