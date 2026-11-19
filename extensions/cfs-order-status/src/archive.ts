import type { HistoryEntry } from './types';

const ENDPOINT = 'shopify:admin/api/graphql.json';
const TYPE = '$app:cfs_status_entry';

// History entries kept in the order metafield. Older ones live as metaobjects.
export const RECENT_LIMIT = 20;

export type ArchiveResult = { ok: true } | { ok: false; message: string };

export interface OlderPage {
  entries: HistoryEntry[];
  endCursor: string | null;
  hasNextPage: boolean;
}

// Metaobject handles allow lowercase letters, digits and hyphens. Order id keeps two orders apart.
export function entryHandle(orderId: string, entryId: string): string {
  const orderNumber = orderId.split('/').pop() ?? orderId;
  return `o${orderNumber}-${entryId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

// recent = newest `limit` entries in their original order; trimmed = the older remainder.
export function splitHistory(history: HistoryEntry[], limit: number = RECENT_LIMIT) {
  const cut = Math.max(history.length - limit, 0);
  return { recent: history.slice(cut), trimmed: history.slice(0, cut) };
}

async function post(fetchFn: typeof fetch, query: string, variables: unknown) {
  const res = await fetchFn(ENDPOINT, { method: 'POST', body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('; '));
  return body.data;
}

const UPSERT = `#graphql
  mutation CfsArchiveEntry($h: MetaobjectHandleInput!, $m: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $h, metaobject: $m) {
      metaobject { id }
      userErrors { code message }
    }
  }`;

// Idempotent: the handle comes from order and entry id, so writing an entry twice updates it.
export async function archiveEntries(
  orderId: string,
  entries: HistoryEntry[],
  fetchFn: typeof fetch = fetch,
): Promise<ArchiveResult> {
  try {
    for (const entry of entries) {
      const data = await post(fetchFn, UPSERT, {
        h: { type: TYPE, handle: entryHandle(orderId, entry.id) },
        m: {
          fields: [
            { key: 'order_id', value: orderId },
            { key: 'entry_id', value: entry.id },
            { key: 'at', value: entry.at },
            { key: 'actor_name', value: entry.by.name },
            { key: 'payload', value: JSON.stringify(entry) },
          ],
        },
      });
      const errors = data.metaobjectUpsert.userErrors as { message: string }[];
      if (errors.length) return { ok: false, message: errors.map((e) => e.message).join('; ') };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

const OLDER = `#graphql
  query CfsOlderHistory($q: String!, $first: Int!, $after: String) {
    metaobjects(type: "${TYPE}", first: $first, after: $after, query: $q, sortKey: "updated_at", reverse: true) {
      nodes { fields { key value } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

// Archived entries for one order, newest first. Search is not instant, so the newest entries
// must come from the order metafield, never from here.
export async function loadOlderHistory(
  orderId: string,
  opts: { after?: string | null; first?: number } = {},
  fetchFn: typeof fetch = fetch,
): Promise<OlderPage> {
  const data = await post(fetchFn, OLDER, {
    q: `fields.order_id:'${orderId}'`,
    first: opts.first ?? RECENT_LIMIT,
    after: opts.after ?? null,
  });
  const conn = data.metaobjects;
  const entries = (conn.nodes as { fields: { key: string; value: string }[] }[]).map((n) =>
    JSON.parse(n.fields.find((f) => f.key === 'payload')!.value) as HistoryEntry,
  );
  return { entries, endCursor: conn.pageInfo.endCursor, hasNextPage: conn.pageInfo.hasNextPage };
}
