// Short-lived signed links for export downloads. A plain browser tab cannot send the app's session token,
// so staff ask for a link (verified staff only) and the link itself proves the request. Nothing is stored.
import { createHmac, timingSafeEqual } from "node:crypto";

const LIFETIME_MS = 5 * 60_000;
const mac = (body, secret) => createHmac("sha256", secret).update(body).digest("base64url");

/** token = base64url(JSON { shop, kind, query, exp }) + "." + HMAC. `query` is the filter query string. */
export function signExportLink({ shop, kind, query }, secret, now = Date.now()) {
  if (!secret) throw new Error("No secret to sign export links with");
  const body = Buffer.from(JSON.stringify({ shop, kind, query, exp: now + LIFETIME_MS })).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** { ok: true, shop, kind, query } or { ok: false, reason: "bad_token" | "bad_signature" | "expired" }. */
export function verifyExportLink(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !secret) return { ok: false, reason: "bad_token" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "bad_token" };
  const [body, sig] = parts;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };
  let data;
  try {
    data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_token" };
  }
  if (typeof data?.exp !== "number" || data.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, shop: data.shop, kind: data.kind, query: data.query };
}
