export interface Actor {
  id: string | null;
  name: string;
  source: 'staff-member' | 'self-declared';
}

export function selfDeclaredActor(name: string): Actor {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter your name');
  return { id: null, name: trimmed, source: 'self-declared' };
}

const STAFF_QUERY = `#graphql
  query CfsCurrentStaff {
    currentStaffMember { id name }
  }`;

// The verified staff member, or null when Shopify will not tell us (no read_users scope,
// no signed-in staff member, or a network failure). Never throws.
export async function fetchStaffActor(fetchFn: typeof fetch = fetch): Promise<Actor | null> {
  try {
    const res = await fetchFn('shopify:admin/api/graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query: STAFF_QUERY }),
    });
    const body = await res.json();
    if (body.errors?.length) return null;
    const staff = body.data?.currentStaffMember;
    const name = typeof staff?.name === 'string' ? staff.name.trim() : '';
    if (!staff?.id || !name) return null;
    return { id: staff.id, name, source: 'staff-member' };
  } catch {
    return null;
  }
}

// The staff member the backend verified from the Shopify session token (api/whoami), as an actor.
// Null when there is none. Used when Shopify's own sign-in does not name the staff member.
export function verifiedActor(user: { id?: string; name?: string } | null | undefined): Actor | null {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (!user?.id || !name) return null;
  return { id: String(user.id), name, source: 'staff-member' };
}

// Verified staff member if there is one, otherwise the typed name (marked unverified).
export function resolveActor(staff: Actor | null, typedName: string): Actor {
  return staff ?? selfDeclaredActor(typedName);
}
