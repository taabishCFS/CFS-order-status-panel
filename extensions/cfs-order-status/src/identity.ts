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
