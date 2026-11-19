import { archiveEntries, splitHistory } from './archive';
import { saveState, type SaveResult } from './store';
import type { StatusState } from './types';

interface Deps {
  archive?: typeof archiveEntries;
  save?: typeof saveState;
}

// Saves `next` (the current state plus the new entry). Entries beyond the latest 20 are
// archived as metaobjects first, and the save stops if that fails, so no entry is ever
// dropped from the metafield without being archived. Archiving is idempotent, so a stale
// save that is retried writes the same entries again without harm.
export async function commitChange(
  orderId: string,
  current: StatusState,
  next: StatusState,
  digest: string | null,
  deps: Deps = {},
): Promise<SaveResult> {
  const archive = deps.archive ?? archiveEntries;
  const save = deps.save ?? saveState;

  const { recent, trimmed } = splitHistory(next.history);
  const archived = await archive(orderId, trimmed);
  if (!archived.ok) {
    return { ok: false, reason: 'error', message: `Could not archive older history: ${archived.message}` };
  }

  const totalEntries = (current.totalEntries ?? current.history.length) + 1;
  return save(orderId, { ...next, history: recent, totalEntries }, digest);
}
