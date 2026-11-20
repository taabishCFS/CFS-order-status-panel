// Signed server-to-server calls to the configurator's /staff/* routes. Mirrors the configurator's
// signature.server.js: the same inputs must give the same signature (see the shared test vector).
import { createHash, createHmac } from "node:crypto";

const MIN_SECRET_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 10_000;

export class ConfiguratorError extends Error {
  constructor({ status, code, body = null }) {
    super(`Configurator ${code} (${status})`);
    this.name = "ConfiguratorError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Hex HMAC-SHA256 over timestamp, method, path with query, shop and a hash of the body. */
export function signRequest({ secret, timestamp, method, path, shop, body = "" }) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update([timestamp, method.toUpperCase(), path, shop, bodyHash].join("\n")).digest("hex");
}

/** Path and query with the query re-encoded the one way both apps sign it. */
export function canonicalPath(url) {
  const { pathname, searchParams } = new URL(url);
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * { shop, path, method = "GET", body } -> parsed JSON. body is an object, sent as JSON.
 * Throws ConfiguratorError: status 0 for timeout/network/not configured, otherwise the HTTP status.
 */
export async function callConfigurator(
  { shop, path, method = "GET", body },
  {
    fetchImpl = fetch,
    secret = process.env.STAFF_API_SECRET,
    baseUrl = process.env.CONFIGURATOR_URL,
    now = Date.now,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH || !baseUrl) {
    throw new ConfiguratorError({ status: 0, code: "not_configured" });
  }

  const hasBody = method !== "GET" && body !== undefined;
  const raw = hasBody ? JSON.stringify(body) : "";
  const timestamp = String(now());
  const headers = {
    "x-cfs-shop": shop,
    "x-cfs-timestamp": timestamp,
    "x-cfs-signature": signRequest({ secret, timestamp, method, path: canonicalPath(`https://x${path}`), shop, body: raw }),
  };
  if (hasBody) headers["content-type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      ...(hasBody ? { body: raw } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ConfiguratorError({ status: 0, code: error?.name === "AbortError" ? "timeout" : "unavailable" });
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.ok && json) return json;
  throw new ConfiguratorError({ status: response.status, code: json?.errors?.[0]?.code ?? "unavailable", body: json });
}
