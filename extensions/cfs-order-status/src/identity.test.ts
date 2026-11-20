import { describe, expect, it, vi } from 'vitest';
import { fetchStaffActor, resolveActor, selfDeclaredActor, verifiedActor } from './identity';

const reply = (body: unknown) => vi.fn(async () => ({ json: async () => body }) as Response);
const asFetch = (f: unknown) => f as unknown as typeof fetch;

describe('selfDeclaredActor', () => {
  it('marks the actor as self-declared with no Shopify ID', () => {
    expect(selfDeclaredActor('Sam')).toEqual({ id: null, name: 'Sam', source: 'self-declared' });
  });

  it('trims surrounding whitespace from the name', () => {
    expect(selfDeclaredActor('  Sam Patel  ').name).toBe('Sam Patel');
  });

  it('rejects an empty or blank name', () => {
    expect(() => selfDeclaredActor('')).toThrow('Enter your name');
    expect(() => selfDeclaredActor('   ')).toThrow('Enter your name');
  });
});

describe('fetchStaffActor', () => {
  it('returns the logged-in staff member as a verified actor', async () => {
    const f = reply({ data: { currentStaffMember: { id: 'gid://shopify/StaffMember/1', name: 'Sam Patel' } } });
    expect(await fetchStaffActor(asFetch(f))).toEqual({ id: 'gid://shopify/StaffMember/1', name: 'Sam Patel', source: 'staff-member' });
    const body = JSON.parse(((f.mock.calls[0] as unknown[])[1] as { body: string }).body);
    expect(body.query).toContain('currentStaffMember');
  });

  it('returns null when Shopify denies access (no read_users)', async () => {
    expect(await fetchStaffActor(asFetch(reply({ errors: [{ message: 'Access denied' }] })))).toBeNull();
  });

  it('returns null when there is no current staff member', async () => {
    expect(await fetchStaffActor(asFetch(reply({ data: { currentStaffMember: null } })))).toBeNull();
  });

  it('returns null when the staff name is blank', async () => {
    const f = reply({ data: { currentStaffMember: { id: 'gid://shopify/StaffMember/1', name: '  ' } } });
    expect(await fetchStaffActor(asFetch(f))).toBeNull();
  });

  it('returns null instead of throwing when fetch fails', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    expect(await fetchStaffActor(asFetch(f))).toBeNull();
  });
});

describe('resolveActor', () => {
  const staff = { id: 'gid://shopify/StaffMember/1', name: 'Sam Patel', source: 'staff-member' as const };

  it('uses the verified staff member and ignores any typed name', () => {
    expect(resolveActor(staff, 'Someone Else')).toEqual(staff);
  });

  it('falls back to the typed name, marked self-declared', () => {
    expect(resolveActor(null, 'Sam')).toEqual({ id: null, name: 'Sam', source: 'self-declared' });
  });

  it('still rejects a blank typed name when there is no staff member', () => {
    expect(() => resolveActor(null, '  ')).toThrow('Enter your name');
  });
});

describe('verifiedActor', () => {
  it('turns the backend-verified staff member into a verified actor', () => {
    expect(verifiedActor({ id: '9', name: 'Sam Patel', source: 'verified' })).toEqual({ id: '9', name: 'Sam Patel', source: 'staff-member' });
  });

  it('is null when there is no verified staff member', () => {
    for (const v of [null, undefined, {}, { id: '9' }, { id: '9', name: '   ' }, { name: 'Sam' }]) expect(verifiedActor(v as never)).toBeNull();
  });
});
