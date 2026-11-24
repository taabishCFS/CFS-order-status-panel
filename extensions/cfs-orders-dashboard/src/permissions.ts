// Staff permissions: which people may do the restricted actions. The server decides; this only reads and saves the tick-list.
import { callBackendResult } from './backend';

export interface PermissionDef { key: string; label: string; detail: string }
export interface StaffPermissions { staffId: string; name: string; keys: string[]; lastSeenAt: string | null }
export interface PermissionsData {
  me: { id: string; name: string; restricted: boolean; keys: string[]; canManage: boolean };
  permissions: PermissionDef[];
  staff: StaffPermissions[];
}

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can use this page.',
  forbidden: 'Only a manager can change permissions.',
  bad_request: 'That change was not understood. Refresh the page and try again.',
  not_found: 'That staff member is not on the list. Refresh the page.',
  last_manager: 'There must always be at least one manager. Give someone else Manage permissions first.',
};
const explain = (status: number, body: { error?: string } | null): string => EXPLAIN[body?.error ?? ''] ?? `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function loadPermissions(fetchFn: typeof fetch = fetch): Promise<{ ok: true; data: PermissionsData } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/permissions', undefined, fetchFn);
    const body = res.body as (PermissionsData & { error?: string }) | null;
    return res.ok && body?.me ? { ok: true, data: body } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function savePermissions(staffId: string, keys: string[], fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/permissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ staffId, keys }) }, fetchFn);
    return res.ok ? { ok: true } : { ok: false, message: explain(res.status, res.body as { error?: string } | null) };
  } catch (e) {
    return failure(e);
  }
}

/** Add or take away one permission from a list, keeping each only once. */
export const toggleKey = (keys: string[], key: string): string[] => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]);
