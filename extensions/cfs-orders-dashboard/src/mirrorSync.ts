import { callBackendResult } from './backend';

// After a staff save, ask the backend to refresh its copy of the order so the order lists show the new status.
// Fire and forget: a failure here never undoes or blocks the save (the webhook also refreshes the copy).
export async function syncOrder(orderId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(`/api/orders/${orderId.split('/').pop()}/sync`, { method: 'POST' });
  } catch {
    // ignored on purpose
  }
}

export type BackfillResult = { ok: true; count: number } | { ok: false; message: string; count: number };

const MAX_BACKFILL_PAGES = 5000;

// Copies every existing order into the backend one page at a time (25 per call), so the lists can show
// orders that were saved before new fields existed. Stops at the first failure and reports how far it got.
export async function runBackfill(onProgress?: (count: number) => void, fetchImpl: typeof fetch = fetch): Promise<BackfillResult> {
  let after: string | null = null;
  let count = 0;
  try {
    for (let i = 0; i < MAX_BACKFILL_PAGES; i += 1) {
      const res = await callBackendResult('/api/backfill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ after }) }, fetchImpl);
      if (!res.ok) return { ok: false, message: `The server answered with status ${res.status}`, count };
      const body = res.body as { count: number; endCursor: string | null; hasNext: boolean };
      count += body.count;
      onProgress?.(count);
      if (!body.hasNext) return { ok: true, count };
      after = body.endCursor;
    }
    return { ok: false, message: 'Stopped after too many pages', count };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), count };
  }
}
