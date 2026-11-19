import { describe, expect, it, vi } from 'vitest';
import { commitChange } from './save';
import { applyChange, emptyState } from './state';
import type { StatusState } from './types';

const ORDER = 'gid://shopify/Order/1036';
const actor = { id: 'gid://shopify/StaffMember/1', name: 'Sam Patel', source: 'staff-member' as const };
const status = { id: 46, label: 'Collection/Display Stock' };

function withEntries(n: number, extra: Partial<StatusState> = {}): StatusState {
  let s: StatusState = { ...emptyState(), ...extra };
  for (let i = 0; i < n; i++) {
    s = applyChange(s, { scope: 'order', lineIds: [], status, actor, now: `2026-11-18T10:${String(i).padStart(2, '0')}:00Z`, entryId: `e${i}` });
  }
  return s;
}
const nextOf = (s: StatusState, id = 'new') =>
  applyChange(s, { scope: 'order', lineIds: [], status, actor, now: '2026-11-19T09:00:00Z', entryId: id });

const okArchive = () => vi.fn(async () => ({ ok: true as const }));
const okSave = () => vi.fn(async () => ({ ok: true as const, digest: 'd2' }));

describe('commitChange', () => {
  it('archives nothing and keeps every entry while under the limit', async () => {
    const current = withEntries(3);
    const archive = okArchive();
    const save = okSave();
    expect(await commitChange(ORDER, current, nextOf(current), 'd1', { archive, save })).toEqual({ ok: true, digest: 'd2' });
    expect(archive).toHaveBeenCalledWith(ORDER, []);
    const saved = save.mock.calls[0][1] as StatusState;
    expect(saved.history).toHaveLength(4);
    expect(saved.totalEntries).toBe(4);
    expect(save.mock.calls[0][2]).toBe('d1');
  });

  it('archives the surplus of a legacy order and saves exactly the newest 20', async () => {
    const current = withEntries(25);
    const archive = okArchive();
    const save = okSave();
    await commitChange(ORDER, current, nextOf(current), 'd1', { archive, save });
    const archived = archive.mock.calls[0][1] as { id: string }[];
    expect(archived.map((e) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
    const saved = save.mock.calls[0][1] as StatusState;
    expect(saved.history).toHaveLength(20);
    expect(saved.history[19].id).toBe('new');
    expect(saved.history[0].id).toBe('e6');
    expect(saved.totalEntries).toBe(26);
  });

  it('does not save when the archive fails, so no entry is dropped unarchived', async () => {
    const current = withEntries(25);
    const archive = vi.fn(async () => ({ ok: false as const, message: 'Metaobject write failed' }));
    const save = okSave();
    const result = await commitChange(ORDER, current, nextOf(current), 'd1', { archive, save });
    expect(result).toEqual({ ok: false, reason: 'error', message: expect.stringContaining('Metaobject write failed') });
    expect(save).not.toHaveBeenCalled();
  });

  it('returns a stale result unchanged, and a retry archives the same entries again', async () => {
    const current = withEntries(22);
    const archive = okArchive();
    const save = vi.fn(async () => ({ ok: false as const, reason: 'stale' as const, message: 'modified' }));
    const first = await commitChange(ORDER, current, nextOf(current), 'd1', { archive, save });
    const second = await commitChange(ORDER, current, nextOf(current), 'd1', { archive, save });
    expect(first).toEqual({ ok: false, reason: 'stale', message: 'modified' });
    expect(second).toEqual(first);
    const ids = (call: unknown[]) => (call[1] as { id: string }[]).map((e) => e.id);
    expect(ids(archive.mock.calls[1])).toEqual(ids(archive.mock.calls[0]));
  });

  it('increments an existing totalEntries instead of recounting from the trimmed history', async () => {
    const current = withEntries(20, { totalEntries: 57 });
    const save = okSave();
    await commitChange(ORDER, current, nextOf(current), 'd1', { archive: okArchive(), save });
    expect((save.mock.calls[0][1] as StatusState).totalEntries).toBe(58);
  });
});
