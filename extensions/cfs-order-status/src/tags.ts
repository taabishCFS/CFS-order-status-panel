const ENDPOINT = 'shopify:admin/api/graphql.json';
const PREFIX = 'CFS status: ';

export const statusTag = (label: string): string => `${PREFIX}${label}`;

// Earlier CFS status tags (any capitalisation) other than the new one.
export function staleStatusTags(existing: string[], newTag: string): string[] {
  return existing.filter((t) => t.toLowerCase().startsWith(PREFIX.toLowerCase()) && t !== newTag);
}

async function gql(fetchFn: typeof fetch, query: string, variables: unknown) {
  const res = await fetchFn(ENDPOINT, { method: 'POST', body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('; '));
  return body.data;
}

const TAGS_QUERY = `#graphql
  query CfsTags($id: ID!) { order(id: $id) { tags } }`;
const ADD = `#graphql
  mutation CfsTagsAdd($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`;
const REMOVE = `#graphql
  mutation CfsTagsRemove($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`;

export type TagResult = { ok: true } | { ok: false; message: string };

// Mirrors the whole-order status as an order tag so it shows in the Orders list Tags column.
// The metafield stays the source of truth; callers treat a failure here as a warning.
export async function syncStatusTag(orderId: string, label: string, fetchFn: typeof fetch = fetch): Promise<TagResult> {
  try {
    const tag = statusTag(label);
    const existing: string[] = (await gql(fetchFn, TAGS_QUERY, { id: orderId })).order.tags;
    const added = (await gql(fetchFn, ADD, { id: orderId, tags: [tag] })).tagsAdd.userErrors;
    if (added.length) return { ok: false, message: added.map((e: { message: string }) => e.message).join('; ') };
    const stale = staleStatusTags(existing, tag);
    if (stale.length) {
      const removed = (await gql(fetchFn, REMOVE, { id: orderId, tags: stale })).tagsRemove.userErrors;
      if (removed.length) return { ok: false, message: removed.map((e: { message: string }) => e.message).join('; ') };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
