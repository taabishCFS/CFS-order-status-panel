import { describe, expect, it, vi } from 'vitest';
import { loadSupplierSales, shortcutRange, sortBrands } from './supplierSales';

const b = (brand: string, saleMinor: number, units: number) => ({ brand, store: false, saleMinor, grandMinor: saleMinor + 100, units });

describe('supplierSales', () => {
  it('sorts brands by a column either way', () => {
    const list = [b('Kaye', 500, 1), b('Duke', 900, 3), b('Ash', 100, 2)];
    expect(sortBrands(list, 'brand', true).map((x) => x.brand)).toEqual(['Ash', 'Duke', 'Kaye']);
    expect(sortBrands(list, 'sale', false).map((x) => x.brand)).toEqual(['Duke', 'Kaye', 'Ash']);
    expect(sortBrands(list, 'units', true).map((x) => x.brand)).toEqual(['Kaye', 'Ash', 'Duke']);
  });
  it('maps the old shortcut names', () => {
    expect(shortcutRange('Previous Month', '2026-11-27')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('asks with the breakup switch and returns the server message on failure', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ sites: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    expect((await loadSupplierSales('2026-11-01', '2026-11-30', true, ok as unknown as typeof fetch)).ok).toBe(true);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain('detail=1');
    const bad = vi.fn(async () => new Response(JSON.stringify({ message: 'Down' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    expect(await loadSupplierSales('a', 'b', false, bad as unknown as typeof fetch)).toEqual({ ok: false, message: 'Down' });
  });
});
