import { emptyState } from './state';
import type { StatusState } from './types';

const ENDPOINT = 'shopify:admin/api/graphql.json';
const NAMESPACE = '$app';
const KEY = 'cfs_status';

const LOAD_QUERY = `#graphql
  query CfsStatus($id: ID!) {
    order(id: $id) {
      metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value compareDigest }
    }
  }`;

const SAVE_MUTATION = `#graphql
  mutation CfsStatusSave($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { compareDigest }
      userErrors { code message }
    }
  }`;

export type SaveResult =
  | { ok: true; digest: string }
  | { ok: false; reason: 'stale' | 'error'; message: string };

async function post(fetchFn: typeof fetch, query: string, variables: unknown) {
  const res = await fetchFn(ENDPOINT, { method: 'POST', body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join('; '));
  return body.data;
}

export async function loadState(
  orderId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ state: StatusState; digest: string | null }> {
  const data = await post(fetchFn, LOAD_QUERY, { id: orderId });
  const metafield = data?.order?.metafield;
  if (!metafield) return { state: emptyState(), digest: null };
  try {
    return { state: JSON.parse(metafield.value) as StatusState, digest: metafield.compareDigest };
  } catch {
    throw new Error('The saved CFS status could not be read. Do not save; contact an administrator.');
  }
}

export async function saveState(
  orderId: string,
  state: StatusState,
  digest: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<SaveResult> {
  try {
    const data = await post(fetchFn, SAVE_MUTATION, {
      metafields: [
        {
          ownerId: orderId,
          namespace: NAMESPACE,
          key: KEY,
          type: 'json',
          value: JSON.stringify(state),
          compareDigest: digest,
        },
      ],
    });
    const errors = data.metafieldsSet.userErrors as { code: string; message: string }[];
    if (errors.length) {
      const stale = errors.some((e) => e.code === 'STALE_OBJECT');
      return { ok: false, reason: stale ? 'stale' : 'error', message: errors.map((e) => e.message).join('; ') };
    }
    return { ok: true, digest: data.metafieldsSet.metafields[0].compareDigest };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
