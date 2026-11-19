import { describe, expect, it, vi } from 'vitest';
import { emptyState } from '../../cfs-order-status/src/state';
import type { StatusState } from '../../cfs-order-status/src/types';
import { saveChange } from './writes';

const ORDER = 'gid://shopify/Order/1';
const loaded = { state: emptyState(), digest: 'D1' };
const next: StatusState = { ...emptyState(), schemaVersion: 2 };

describe('saveChange', () => {
  it('builds the next record from the loaded one and commits it with the loaded digest', async () => {
    const commit = vi.fn(async () => ({ ok: true as const, digest: 'D2' }));
    const build = vi.fn(() => next);
    const result = await saveChange(ORDER, loaded, build, { commit });
    expect(build).toHaveBeenCalledWith(loaded.state);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(ORDER, loaded.state, next, 'D1');
    expect(result).toEqual({ ok: true, digest: 'D2' });
  });

  it('passes a stale refusal through unchanged', async () => {
    const stale = { ok: false as const, reason: 'stale' as const, message: 'changed' };
    const commit = vi.fn(async () => stale);
    expect(await saveChange(ORDER, loaded, () => next, { commit })).toEqual(stale);
  });

  it('returns the message and writes nothing when the change cannot be built', async () => {
    const commit = vi.fn();
    const result = await saveChange(ORDER, loaded, () => { throw new Error('Select at least one item'); }, { commit });
    expect(result).toEqual({ ok: false, reason: 'error', message: 'Select at least one item' });
    expect(commit).not.toHaveBeenCalled();
  });
});
