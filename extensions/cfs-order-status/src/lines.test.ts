import { describe, expect, it } from 'vitest';
import { currentLines } from './lines';

const node = (id: string, quantity: number, currentQuantity: number, title = id) => ({
  id,
  title,
  variantTitle: null,
  quantity,
  currentQuantity,
});

describe('currentLines', () => {
  it('drops lines that were removed in an order edit (current quantity 0)', () => {
    const result = currentLines([node('a', 1, 1), node('removed', 1, 0), node('b', 2, 2)]);
    expect(result.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('shows the current quantity, not the originally ordered one', () => {
    expect(currentLines([node('a', 3, 2)])[0].quantity).toBe(2);
  });

  it('keeps the order of the lines it is given', () => {
    expect(currentLines([node('z', 1, 1), node('a', 1, 1)]).map((l) => l.id)).toEqual(['z', 'a']);
  });
});
