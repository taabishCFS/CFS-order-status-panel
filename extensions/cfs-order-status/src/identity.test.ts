import { describe, expect, it } from 'vitest';
import { selfDeclaredActor } from './identity';

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
