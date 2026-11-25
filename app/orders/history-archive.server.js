import { archiveEntries, loadOlderHistory } from "../../extensions/cfs-order-status/src/archive.ts";

// Older status history lives in app-owned metaobjects. Shopify lets only the app itself write and search those, not a
// signed-in staff member's own access, so the page asks the server, which acts as the app (offline token).

// The status helpers call `fetch("shopify:admin/api/graphql.json", ...)`; on the server the same call goes through admin.graphql.
export const viaGraphql = (graphql) => async (_url, init) => {
  const { query, variables } = JSON.parse(init.body);
  return graphql(query, { variables });
};

export const MAX_ENTRIES = 50;
const SCOPES = ["order", "lines", "expected-date", "delivery", "note", "instructions", "configuration", "contact", "tracking", "refund", "condition", "services", "product"];

// An entry the page may archive: the shape the history list expects, nothing else (no stray fields are stored).
export function cleanEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) return null;
  const out = [];
  for (const e of entries) {
    const ok =
      e && typeof e === "object" && typeof e.id === "string" && e.id.length > 0 && e.id.length <= 100 &&
      typeof e.at === "string" && e.at.length <= 40 && e.by && typeof e.by.name === "string" &&
      SCOPES.includes(e.scope) && Array.isArray(e.changes);
    if (!ok) return null;
    out.push(e);
  }
  return out;
}

/** Writes older history entries; { ok: true } or { ok: false, message }. */
export function archiveForOrder(graphql, orderId, entries) {
  return archiveEntries(orderId, entries, viaGraphql(graphql));
}

/** One page of archived entries, newest first: { entries, endCursor, hasNextPage }. */
export function olderForOrder(graphql, orderId, after) {
  return loadOlderHistory(orderId, { after: after || null }, viaGraphql(graphql));
}
