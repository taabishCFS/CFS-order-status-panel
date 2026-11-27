import { describe, expect, it, vi } from 'vitest';
import { filterQuery, loadMarketing, quickDates, rowFilters, startFilters } from './marketingSales';

const f = startFilters('2026-11-27');
const row = (key: string, productId = '') => ({ key, name: key, productId, sku: '', orders: 1, units: 1, salesMinor: 100 });

describe('marketingSales', () => {
  it('starts on this month up to today, and sends only the filters set', () => {
    expect(f).toMatchObject({ from: '2026-11-01', to: '2026-11-27', group: 'brand', sort: 'sales' });
    expect(filterQuery({ ...f, brand: 'Duke', page: 2 }).toString()).toBe('from=2026-11-01&to=2026-11-27&brand=Duke&group=brand&sort=sales&page=2');
  });
  it('has the quick dates, current periods up to today', () => {
    const q = Object.fromEntries(quickDates('2026-11-27').map((x) => [x.label, `${x.from}..${x.to}`]));
    expect(q).toMatchObject({
      'Current week': '2026-11-23..2026-11-27', 'Previous week': '2026-11-16..2026-11-22', 'Current month': '2026-11-01..2026-11-27',
      'Previous month': '2026-10-01..2026-10-31', 'Current year': '2026-01-01..2026-11-27', 'Previous year': '2025-01-01..2025-12-31',
    });
  });
  it('narrows to a row: month stays inside the dates, unknown ranges and products cannot', () => {
    expect(rowFilters('month', row('2026-11'), { ...f, from: '2026-10-15' })).toEqual({ from: '2026-11-01', to: '2026-11-27' });
    expect(rowFilters('month', row('2026-10'), { ...f, from: '2026-10-15' })).toEqual({ from: '2026-10-15', to: '2026-10-31' });
    expect(rowFilters('source', row('Unspecified'), f)).toEqual({ source: '__unspecified__' });
    expect(rowFilters('range', row('No collection'), f)).toBeNull();
    expect(rowFilters('product', row('unknown:x:y'), f)).toBeNull();
    expect(rowFilters('order', row('55', '55'), f)).toEqual({ order: '55' });
  });
  it('returns the server message on failure', async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ message: 'You do not have permission' }), { status: 403, headers: { 'content-type': 'application/json' } }));
    expect(await loadMarketing(f, bad as unknown as typeof fetch)).toEqual({ ok: false, message: 'You do not have permission' });
  });
});
