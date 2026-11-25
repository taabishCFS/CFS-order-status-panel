import { commitChange } from '../../extensions/cfs-order-status/src/save';
import type { SaveResult } from '../../extensions/cfs-order-status/src/store';
import type { StatusState } from '../../extensions/cfs-order-status/src/types';
import { archiveViaServer } from './historyApi';

interface Deps {
  commit?: typeof commitChange;
}

// The one write path of the Order Detail page. `build` turns the loaded record into the next one;
// if it refuses (no lines ticked, blank note, bad date) nothing is written. The loaded digest is
// sent with the save, so a record changed by someone else since it was loaded is refused as stale.
export async function saveChange(
  orderId: string,
  loaded: { state: StatusState; digest: string | null },
  build: (state: StatusState) => StatusState,
  deps: Deps = {},
): Promise<SaveResult> {
  // Older history is archived by the server (staff access cannot write it); the order's own record is saved from here.
  const commit = deps.commit ?? ((id, current, next, digest) => commitChange(id, current, next, digest, { archive: archiveViaServer }));
  let next: StatusState;
  try {
    next = build(loaded.state);
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  return commit(orderId, loaded.state, next, loaded.digest);
}
