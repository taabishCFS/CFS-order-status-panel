import { describe, expect, it } from 'vitest';
import type { LineRow } from './listApi';
import { formatDate, formatMoney, gatewayLabel, lineTitle, matchesFind, pageItems, payTypeLabel, siteLogo, statusTone, toggleAll, toggleOne } from './orderList';

describe('pageItems', () => {
  it('lists every page, then Next and All, when there are few pages', () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3, 'next', 'all']);
  });
  it('keeps a window of five around the current page', () => {
    expect(pageItems(8, 20)).toEqual([6, 7, 8, 9, 10, 'next', 'all']);
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 'next', 'all']);
  });
  it('slides the window back at the end and drops Next on the last page', () => {
    expect(pageItems(20, 20)).toEqual([16, 17, 18, 19, 20, 'all']);
  });
});

describe('labels and formats', () => {
  it('names the pay types', () => {
    expect(payTypeLabel('paid')).toBe('Fully paid');
    expect(payTypeLabel('partial')).toBe('Partially paid');
    expect(payTypeLabel('awaiting')).toBe('Awaiting payment');
    expect(payTypeLabel('failed')).toBe('Payment failed');
  });
  it('shows the legacy gateway badge text', () => {
    expect(gatewayLabel('kody')).toBe('KODY');
    expect(gatewayLabel('shopify_payments')).toBe('SHOPIFY');
    expect(gatewayLabel('some_new_gateway')).toBe('SOME NEW GATEWAY');
    expect(gatewayLabel(null)).toBe('Unknown');
  });
  it('formats dates as dd/mm/yyyy and money in pounds', () => {
    expect(formatDate('2026-11-20T10:00:00.000Z')).toBe('20/11/2026');
    expect(formatDate('nonsense')).toBe('');
    expect(formatMoney(107065, 'GBP')).toBe('£1070.65');
    expect(formatMoney(1000, 'EUR')).toBe('EUR 10.00');
  });
  it('gives the CFS logo and nothing for sites without one', () => {
    expect(siteLogo('CFS')).toMatch(/^https:\/\/.*Choice-Obsedian\.png$/);
    expect(siteLogo('TFS')).toBeNull();
    expect(siteLogo(null)).toBeNull();
  });
  it('colours Payment Process orange and failed statuses red', () => {
    expect(statusTone(1)).toBe('warning');
    expect(statusTone(7)).toBe('critical');
    expect(statusTone(999)).toBe('neutral');
  });
});

const line = (over: Partial<LineRow> = {}): LineRow => ({ lineId: 'L1', orderId: 'gid://shopify/Order/1', orderName: '#1035', orderCreatedAt: '2026-11-20T00:00:00Z', site: 'CFS', brand: 'Actona', product: 'Katana Glass Nest of Tables', variantTitle: null, sku: 'H000025390', quantity: 1, priceMinor: 100, currency: 'GBP', lineStatusId: 1, expectedDate: null, deliveryOutcome: null, supplierInvoicePaid: false, ...over });

describe('lineTitle', () => {
  it('names the brand and the line count', () => {
    expect(lineTitle('Actona', 93)).toBe('Orders By Brand : Actona : (93)');
    expect(lineTitle('', 5)).toBe('Orders By Brand : (5)');
  });
});

describe('matchesFind', () => {
  it('matches order, product or code, ignoring case, and everything when empty', () => {
    expect(matchesFind(line(), '1035')).toBe(true);
    expect(matchesFind(line(), 'glass NEST')).toBe(true);
    expect(matchesFind(line(), 'h000025')).toBe(true);
    expect(matchesFind(line(), 'oak')).toBe(false);
    expect(matchesFind(line({ sku: null }), 'zzz')).toBe(false);
    expect(matchesFind(line(), '  ')).toBe(true);
  });
});

describe('selection helpers', () => {
  const rows = [line({ lineId: 'A' }), line({ lineId: 'B' })];
  it('toggles one line without changing the original set', () => {
    const start = new Set(['A']);
    expect([...toggleOne(start, 'B')].sort()).toEqual(['A', 'B']);
    expect([...toggleOne(start, 'A')]).toEqual([]);
    expect([...start]).toEqual(['A']);
  });
  it('select-all picks every row, and clears when every row is already picked', () => {
    expect([...toggleAll(new Set(['A']), rows)].sort()).toEqual(['A', 'B']);
    expect([...toggleAll(new Set(['A', 'B']), rows)]).toEqual([]);
  });
});
