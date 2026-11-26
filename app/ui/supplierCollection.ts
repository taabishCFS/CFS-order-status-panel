// The Supplier Collection list. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface CollectionRow { id: string; number: number; brand: string; address: string; van: string; date: string }
export interface CollectionList { rows: CollectionRow[]; total: number; page: number; pageCount: number; brands: string[]; vans: { id: string; name: string }[] }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string }

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change this list.',
  no_permission: 'You do not have permission to book deliveries. Ask a manager.',
  no_brand: 'Select Brand.',
  no_van: 'Select VAN.',
  no_date: 'Select Date.',
  duplicate: 'Error: Duplicate Record Exists.',
  nothing_selected: 'Please Select Record(s) to Delete.',
  bad_request: 'The request was not accepted. Refresh the page and try again.',
};
const explain = (status: number, body: Body | null): string => EXPLAIN[body?.error ?? ''] ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadCollections(page = 1, fetchFn: typeof fetch = fetch): Promise<Result<CollectionList>> {
  try {
    const res = await callBackendResult(page > 1 ? `/api/supplier-collection?page=${page}` : '/api/supplier-collection', undefined, fetchFn);
    const body = res.body as (CollectionList & Body) | null;
    return res.ok && Array.isArray(body?.rows) ? { ok: true, data: body as CollectionList } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

async function post(payload: object, fetchFn: typeof fetch): Promise<Result<{ deleted?: number }>> {
  try {
    const res = await callBackendResult('/api/supplier-collection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, fetchFn);
    return res.ok ? { ok: true, data: (res.body as { deleted?: number } | null) ?? {} } : { ok: false, message: explain(res.status, res.body as Body | null) };
  } catch (e) {
    return failure(e);
  }
}

export const addCollection = (input: { brand: string; vanId: string; date: string }, fetchFn: typeof fetch = fetch) => post({ op: 'add', ...input }, fetchFn);
export const deleteCollections = (ids: string[], fetchFn: typeof fetch = fetch) => post({ op: 'delete', ids }, fetchFn);
