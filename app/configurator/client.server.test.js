import { describe, expect, it } from "vitest";
import { callConfigurator, canonicalPath, ConfiguratorError, signRequest } from "./client.server";

const SECRET = "k".repeat(32);
const SHOP = "a.myshopify.com";
const base = { secret: SECRET, baseUrl: "https://cfg.test", now: () => 1_800_000_000_000 };
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

describe("signing matches the configurator", () => {
  it("gives the same signature as the configurator for a fixed request (shared test vector)", () => {
    expect(signRequest({ secret: SECRET, timestamp: "1800000000000", method: "POST", path: "/staff/quote", shop: SHOP, body: '{"a":1}' }))
      .toBe("80a517bfc2d27dfb670384cacf0b1aedaa3dec1c04a9f8a56293c8954e22e46d");
  });

  it("canonicalises the query the same way (re-encoded, empty query dropped)", () => {
    expect(canonicalPath("https://x/staff/order-lines?order=gid%3A%2F%2Fshopify%2FOrder%2F1")).toBe("/staff/order-lines?order=gid%3A%2F%2Fshopify%2FOrder%2F1");
    expect(canonicalPath("https://x/staff/order-lines?order=gid://shopify/Order/1")).toBe("/staff/order-lines?order=gid%3A%2F%2Fshopify%2FOrder%2F1");
    expect(canonicalPath("https://x/staff/choices")).toBe("/staff/choices");
  });
});

describe("callConfigurator", () => {
  it("sends a signed request and returns the JSON", async () => {
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
    const body = { productId: "1" };
    const out = await callConfigurator({ shop: SHOP, path: "/staff/quote", method: "POST", body }, { ...base, fetchImpl });
    expect(out).toEqual({ ok: true });
    expect(seen.url).toBe("https://cfg.test/staff/quote");
    expect(seen.init.method).toBe("POST");
    expect(seen.init.body).toBe(JSON.stringify(body));
    expect(seen.init.headers["x-cfs-shop"]).toBe(SHOP);
    expect(seen.init.headers["x-cfs-timestamp"]).toBe("1800000000000");
    expect(seen.init.headers["x-cfs-signature"]).toBe(
      signRequest({ secret: SECRET, timestamp: "1800000000000", method: "POST", path: "/staff/quote", shop: SHOP, body: JSON.stringify(body) }),
    );
  });

  it("signs a GET with its query string and an empty body", async () => {
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, init }; return new Response("{}", { status: 200 }); };
    await callConfigurator({ shop: SHOP, path: "/staff/order-lines?order=gid://shopify/Order/1" }, { ...base, fetchImpl });
    expect(seen.init.method).toBe("GET");
    expect(seen.init.body).toBeUndefined();
    expect(seen.init.headers["x-cfs-signature"]).toBe(
      signRequest({ secret: SECRET, timestamp: "1800000000000", method: "GET", path: "/staff/order-lines?order=gid%3A%2F%2Fshopify%2FOrder%2F1", shop: SHOP, body: "" }),
    );
  });

  it("throws ConfiguratorError with the status and the configurator's error code", async () => {
    for (const [status, code] of [[401, "unauthorized"], [404, "no_snapshot"], [422, "unsupported_product"]]) {
      const err = await callConfigurator({ shop: SHOP, path: "/staff/x" }, { ...base, fetchImpl: reply(status, { ok: false, errors: [{ code }] }) }).catch((e) => e);
      expect(err).toBeInstanceOf(ConfiguratorError);
      expect({ status: err.status, code: err.code }).toEqual({ status, code });
    }
  });

  it("keeps the quote engine's refusal body on a 422", async () => {
    const body = { ok: false, errors: [{ code: "invalid_combination" }] };
    const err = await callConfigurator({ shop: SHOP, path: "/staff/quote", method: "POST", body: {} }, { ...base, fetchImpl: reply(422, body) }).catch((e) => e);
    expect(err.body).toEqual(body);
  });

  it("maps a non-JSON error page to code unavailable", async () => {
    const fetchImpl = async () => new Response("<html>Bad gateway</html>", { status: 502 });
    const err = await callConfigurator({ shop: SHOP, path: "/staff/x" }, { ...base, fetchImpl }).catch((e) => e);
    expect({ status: err.status, code: err.code }).toEqual({ status: 502, code: "unavailable" });
  });

  it("times out, aborting the request", async () => {
    const fetchImpl = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const err = await callConfigurator({ shop: SHOP, path: "/staff/x" }, { ...base, fetchImpl, timeoutMs: 20 }).catch((e) => e);
    expect({ status: err.status, code: err.code }).toEqual({ status: 0, code: "timeout" });
  });

  it("a network failure is code unavailable", async () => {
    const fetchImpl = async () => { throw new TypeError("fetch failed"); };
    const err = await callConfigurator({ shop: SHOP, path: "/staff/x" }, { ...base, fetchImpl }).catch((e) => e);
    expect({ status: err.status, code: err.code }).toEqual({ status: 0, code: "unavailable" });
  });

  it("refuses to send anything without a secret or base URL", async () => {
    let sent = 0;
    const fetchImpl = async () => { sent += 1; return new Response("{}"); };
    for (const over of [{ secret: undefined }, { secret: "short" }, { baseUrl: "" }]) {
      const err = await callConfigurator({ shop: SHOP, path: "/staff/x" }, { ...base, ...over, fetchImpl }).catch((e) => e);
      expect(err.code).toBe("not_configured");
    }
    expect(sent).toBe(0);
  });
});
