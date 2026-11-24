import { describe, expect, it } from 'vitest';
import { loadPermissions, savePermissions, toggleKey } from './permissions';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

describe('permissions', () => {
  it('toggles a key on and off', () => {
    expect(toggleKey(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleKey(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('loads the list', async () => {
    const data = { me: { id: '1', name: 'Sam', restricted: false, keys: [], canManage: true }, permissions: [], staff: [] };
    expect(await loadPermissions(reply(200, data))).toEqual({ ok: true, data });
  });
  it('explains a refusal in words', async () => {
    expect(await loadPermissions(reply(403, { error: 'staff_not_verified' }))).toMatchObject({ ok: false, message: expect.stringContaining('verified staff') });
    expect(await savePermissions('1', [], reply(409, { error: 'last_manager' }))).toMatchObject({ ok: false, message: expect.stringContaining('at least one manager') });
    expect(await savePermissions('1', ['refunds'], reply(200, { ok: true }))).toEqual({ ok: true });
  });
});
