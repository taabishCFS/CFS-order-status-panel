// The Area list. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface AreaRow { id: string; number: number; name: string; postcodes: string; active: boolean }
export interface AreaList { rows: AreaRow[]; total: number; page: number; pageCount: number }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string }

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change areas.',
  no_permission: 'You do not have permission to edit areas (Edit drivers, vans and slots). Ask a manager.',
  no_name: 'Enter the Area name.',
  duplicate: 'Error: Duplicate Record Exists.',
  not_found: 'That area no longer exists. Refresh the page.',
  nothing_selected: 'Please Select Record(s) first.',
  bad_request: 'The request was not accepted. Refresh the page and try again.',
};
const explain = (status: number, body: Body | null): string => EXPLAIN[body?.error ?? ''] ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadAreas(page = 1, fetchFn: typeof fetch = fetch): Promise<Result<AreaList>> {
  try {
    const res = await callBackendResult(page > 1 ? `/api/areas?page=${page}` : '/api/areas', undefined, fetchFn);
    const body = res.body as (AreaList & Body) | null;
    return res.ok && Array.isArray(body?.rows) ? { ok: true, data: body as AreaList } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

async function post(payload: object, fetchFn: typeof fetch): Promise<Result<{ deleted?: number; changed?: number }>> {
  try {
    const res = await callBackendResult('/api/areas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, fetchFn);
    return res.ok ? { ok: true, data: (res.body as { deleted?: number; changed?: number } | null) ?? {} } : { ok: false, message: explain(res.status, res.body as Body | null) };
  } catch (e) {
    return failure(e);
  }
}

export const addArea = (a: { name: string; postcodes: string; active: boolean }, fetchFn: typeof fetch = fetch) => post({ op: 'add', ...a }, fetchFn);
export const updateArea = (a: { id: string; name: string; postcodes: string; active: boolean }, fetchFn: typeof fetch = fetch) => post({ op: 'update', ...a }, fetchFn);
export const setAreasStatus = (ids: string[], active: boolean, fetchFn: typeof fetch = fetch) => post({ op: 'status', ids, active }, fetchFn);
export const deleteAreas = (ids: string[], fetchFn: typeof fetch = fetch) => post({ op: 'delete', ids }, fetchFn);
