import { describe, expect, it } from 'vitest';
import { brandsOf, buildRows, filterRows, summarize, UNMAPPED_BRAND, type OrderNode } from './rows';

const money = (amount: string) => ({ shopMoney: { amount, currencyCode: 'GBP' } });

function order(over: Partial<OrderNode> = {}): OrderNode {
  return {
    id: 'gid://shopify/Order/1',
    name: '#1034',
    createdAt: '2026-11-10T09:00:00Z',
    metafield: null,
    lineItems: {
      nodes: [
        { id: 'gid://shopify/LineItem/11', title: 'Oslo Sideboard', variantTitle: 'Oak', sku: 'HN-OSL', vendor: 'House Nordic', quantity: 2, currentQuantity: 2, originalUnitPriceSet: money('199.00') },
        { id: 'gid://shopify/LineItem/12', title: 'Welcome Mat', variantTitle: null, sku: 'WL-MAT', vendor: 'Welcome', quantity: 1, currentQuantity: 1, originalUnitPriceSet: money('25.50') },
      ],
    },
    ...over,
  };
}

const stamp = (statusId: number, label: string) => ({ statusId, label, at: '2026-11-11T10:00:00Z', by: { name: 'A' } });
const withStatus = (lines: Record<string, unknown>, orderStamp: unknown = null) =>
  ({ value: JSON.stringify({ schemaVersion: 1, order: orderStamp, lines, history: [] }) });

describe('buildRows', () => {
  it('makes one row per line, so a mixed-brand order appears once per brand line', () => {
    const rows = buildRows([order()]);
    expect(rows.map((r) => [r.orderName, r.brand, r.quantity])).toEqual([
      ['#1034', 'House Nordic', 2],
      ['#1034', 'Welcome', 1],
    ]);
  });

  it('keeps two lines that share a SKU as distinct rows', () => {
    const o = order();
    o.lineItems.nodes[1] = { ...o.lineItems.nodes[0], id: 'gid://shopify/LineItem/99', variantTitle: 'Walnut' };
    const rows = buildRows([o]);
    expect(rows.map((r) => r.lineId)).toEqual(['gid://shopify/LineItem/11', 'gid://shopify/LineItem/99']);
    expect(rows.map((r) => r.variantTitle)).toEqual(['Oak', 'Walnut']);
  });

  it('skips lines removed in an order edit and uses the current quantity', () => {
    const o = order();
    o.lineItems.nodes[0].currentQuantity = 0;
    o.lineItems.nodes[1].currentQuantity = 3;
    const rows = buildRows([o]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
  });

  it('reads the saved CFS line status and falls back to the order status for the header', () => {
    const o = order({ metafield: withStatus({ 'gid://shopify/LineItem/11': stamp(4, 'In Stock') }, stamp(3, 'Order in Progress')) });
    const rows = buildRows([o]);
    expect(rows[0].lineStatus).toEqual({ id: 4, label: 'In Stock' });
    expect(rows[1].lineStatus).toBeNull();
    expect(rows[0].orderStatus).toEqual({ id: 3, label: 'Order in Progress' });
  });

  it('treats an unreadable status metafield as no status and flags the row', () => {
    const rows = buildRows([order({ metafield: { value: '{not json' } })]);
    expect(rows.every((r) => r.lineStatus === null && r.statusUnreadable)).toBe(true);
  });

  it('flags a line with no vendor as unmapped instead of dropping it', () => {
    const o = order();
    o.lineItems.nodes[0].vendor = '';
    const rows = buildRows([o]);
    expect(rows[0].brand).toBe(UNMAPPED_BRAND);
    expect(rows[0].unmapped).toBe(true);
    expect(rows[1].unmapped).toBe(false);
  });

  it('formats unit price only when Shopify supplied one', () => {
    const o = order();
    o.lineItems.nodes[1].originalUnitPriceSet = null;
    const rows = buildRows([o]);
    expect(rows[0].unitPrice).toEqual({ amount: '199.00', currency: 'GBP' });
    expect(rows[1].unitPrice).toBeNull();
  });
});

describe('filterRows and summarize', () => {
  const rows = buildRows([
    order(),
    order({ id: 'gid://shopify/Order/2', name: '#1035', lineItems: { nodes: [
      { id: 'gid://shopify/LineItem/21', title: 'Fjord Chair', variantTitle: null, sku: 'HN-FJD', vendor: 'House Nordic', quantity: 4, currentQuantity: 4, originalUnitPriceSet: money('80.00') },
    ] } }),
  ]);

  it('filters by brand and counts lines, distinct orders and units from the matched rows only', () => {
    const matched = filterRows(rows, { brand: 'House Nordic' });
    expect(summarize(matched)).toEqual({ lines: 2, orders: 2, units: 6 });
    expect(summarize(filterRows(rows, { brand: 'Welcome' }))).toEqual({ lines: 1, orders: 1, units: 1 });
  });

  it('counts a multi-line order once in distinct orders', () => {
    expect(summarize(rows)).toEqual({ lines: 3, orders: 2, units: 7 });
  });

  it('searches order name, product, variant and SKU case-insensitively', () => {
    expect(filterRows(rows, { search: '1035' })).toHaveLength(1);
    expect(filterRows(rows, { search: 'oak' })).toHaveLength(1);
    expect(filterRows(rows, { search: 'hn-' })).toHaveLength(2);
  });

  it('filters by line status id, including lines with no status', () => {
    const r = buildRows([order({ metafield: withStatus({ 'gid://shopify/LineItem/11': stamp(4, 'In Stock') }) })]);
    expect(filterRows(r, { statusId: 4 })).toHaveLength(1);
    expect(filterRows(r, { statusId: 'none' })).toHaveLength(1);
  });

  it('lists brands alphabetically with unmapped last', () => {
    const o = order();
    o.lineItems.nodes[1].vendor = '';
    expect(brandsOf(buildRows([o]))).toEqual(['House Nordic', UNMAPPED_BRAND]);
  });
});

describe('expected date and delivery outcome', () => {
  const L11 = 'gid://shopify/LineItem/11';
  const by = { id: null, name: 'A', source: 'self-declared' };
  const v2 = {
    value: JSON.stringify({
      schemaVersion: 2,
      order: null,
      lines: {},
      history: [],
      expected: { [L11]: { date: '2026-12-01', at: 'x', by } },
      delivery: { [L11]: { outcome: 'confirmed', at: 'x', by } },
    }),
  };

  it('reads both from the saved record, and gives null for lines without them', () => {
    const rows = buildRows([order({ metafield: v2 })]);
    expect(rows[0]).toMatchObject({ expectedDate: '2026-12-01', delivery: 'confirmed' });
    expect(rows[1]).toMatchObject({ expectedDate: null, delivery: null });
  });

  it('gives null for both on a version 1 record', () => {
    const rows = buildRows([order({ metafield: withStatus({}) })]);
    expect(rows.every((r) => r.expectedDate === null && r.delivery === null)).toBe(true);
  });

  it('filters to lines with no expected date and counts only those', () => {
    const rows = buildRows([order({ metafield: v2 })]);
    const matched = filterRows(rows, { noExpectedDate: true });
    expect(matched.map((r) => r.lineId)).toEqual(['gid://shopify/LineItem/12']);
    expect(summarize(matched)).toEqual({ lines: 1, orders: 1, units: 1 });
  });
});
