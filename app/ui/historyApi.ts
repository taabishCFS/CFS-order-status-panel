// Older status history is stored where only the app itself may write and search, so these calls go to the server.
import type { ArchiveResult, OlderPage } from '../../extensions/cfs-order-status/src/archive';
import type { HistoryEntry } from '../../extensions/cfs-order-status/src/types';
import { callBackendResult } from './backend';

const path = (orderId: string) => `/api/orders/${orderId.split('/').pop()}/history`;
const reason = (status: number, body: unknown) => (body as { message?: string } | null)?.message ?? `The server answered with status ${status}.`;

export async function archiveViaServer(orderId: string, entries: HistoryEntry[], fetchFn: typeof fetch = fetch): Promise<ArchiveResult> {
  try {
    const res = await callBackendResult(path(orderId), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries }) }, fetchFn);
    return res.ok ? { ok: true } : { ok: false, message: reason(res.status, res.body) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// One page of archived entries, newest first. Throws with the reason when it cannot be read.
export async function loadOlderViaServer(orderId: string, opts: { after?: string | null } = {}, fetchFn: typeof fetch = fetch): Promise<OlderPage> {
  const q = opts.after ? `?after=${encodeURIComponent(opts.after)}` : '';
  const res = await callBackendResult(path(orderId) + q, undefined, fetchFn);
  if (!res.ok) throw new Error(reason(res.status, res.body));
  return res.body as OlderPage;
}
