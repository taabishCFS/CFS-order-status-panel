import { describe, expect, it } from 'vitest';
import { filterReport, paypalSearch, type ReportGroup } from './paypalOrders';

const order = (name: string, title: string, valueMinor: number) => ({ orderId: name, name, createdAt: '2026-11-20T10:00:00Z', customerName: null, valueMinor, items: 1, lines: [{ lineId: name, title, sku: null, quantity: 1, valueMinor, expectedDate: null }] });
const groups: ReportGroup[] = [
  { key: 'green', label: 'G', tone: 'success', orders: 2, items: 2, valueMinor: 300, statuses: [{ statusId: 4, label: 'In Stock', orders: 2, items: 2, valueMinor: 300, list: [order('#1001', 'Sofa', 100), order('#1002', 'Bed', 200)] }] },
  { key: 'black', label: 'B', tone: 'neutral', orders: 1, items: 1, valueMinor: 50, statuses: [{ statusId: 6, label: 'Completed', orders: 1, items: 1, valueMinor: 50, list: [order('#1003', 'Lamp', 50)] }] },
];

describe('Paypal Orders page', () => {
  it('builds the query', () => {
    expect(paypalSearch({ from: '', to: '', range: '30d', gateway: 'paypal' })).toBe('range=30d&gateway=paypal');
    expect(paypalSearch({ from: '2026-11-01', to: '2026-11-28', range: 'custom', gateway: 'paypal' })).toBe('from=2026-11-01&to=2026-11-28&gateway=paypal');
  });
  it('searches by order number or product and works the counts out again', () => {
    const r = filterReport(groups, 'bed');
    expect(r.map((g) => g.key)).toEqual(['green']);
    expect(r[0]).toMatchObject({ orders: 1, valueMinor: 200 });
    expect(filterReport(groups, '#1003')[0].key).toBe('black');
    expect(filterReport(groups, '')).toBe(groups);
  });
});
