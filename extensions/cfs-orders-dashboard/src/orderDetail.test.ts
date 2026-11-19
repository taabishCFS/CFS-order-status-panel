import { describe, expect, it, vi } from 'vitest';
import { loadCustomerBlock, loadOrderDetail, lineMoney } from './orderDetail';

const ORDER = 'gid://shopify/Order/1';
const money = (amount: string) => ({ shopMoney: { amount, currencyCode: 'GBP' } });
const asFetch = (f: unknown) => f as unknown as typeof fetch;

function line(over: Record<string, unknown> = {}) {
  return {
    id: 'gid://shopify/LineItem/11',
    title: 'Oslo Sideboard',
    variantTitle: 'Oak',
    sku: 'HN-OSL',
    vendor: 'House Nordic',
    quantity: 1,
    currentQuantity: 1,
    originalUnitPriceSet: money('119.99'),
    discountAllocations: [{ allocatedAmountSet: money('27.60') }, { allocatedAmountSet: money('11.09') }],
    ...over,
  };
}

// Answers the status-record query and the order-detail query separately, as the real loader asks for both.
function shopify(order: Record<string, unknown> | null, errors?: { message: string }[]) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const { query } = JSON.parse(init.body);
    if (query.includes('CfsStatus')) {
      return { json: async () => ({ data: { order: { metafield: { value: JSON.stringify({ schemaVersion: 1, order: null, lines: {}, history: [] }), compareDigest: 'D1' } } } }) };
    }
    return { json: async () => ({ data: order ? { order } : null, errors }) };
  });
}

const baseOrder = (nodes: unknown[]) => ({
  id: ORDER,
  name: '#1036',
  createdAt: '2026-11-18T09:44:12Z',
  currentSubtotalPriceSet: money('119.99'),
  currentTotalDiscountsSet: money('38.69'),
  currentShippingPriceSet: money('29.99'),
  currentTotalPriceSet: money('111.29'),
  lineItems: { nodes },
});

describe('lineMoney', () => {
  it('works in whole pence: 119.99 less 27.60 and 11.09 is 81.30', () => {
    const m = lineMoney('119.99', 1, ['27.60', '11.09'], 'GBP');
    expect(m).toEqual({
      gross: { amount: '119.99', currency: 'GBP' },
      discount: { amount: '38.69', currency: 'GBP' },
      final: { amount: '81.30', currency: 'GBP' },
    });
  });

  it('accepts the amounts Shopify actually returns, such as 279.0 and 0.0', () => {
    const m = lineMoney('279.0', 1, ['0.0'], 'GBP');
    expect(m.gross.amount).toBe('279.00');
    expect(m.discount.amount).toBe('0.00');
    expect(m.final.amount).toBe('279.00');
  });

  it('multiplies by quantity and shows two decimals with no discount', () => {
    const m = lineMoney('84.00', 2, [], 'GBP');
    expect(m.gross.amount).toBe('168.00');
    expect(m.discount.amount).toBe('0.00');
    expect(m.final.amount).toBe('168.00');
  });
});

describe('loadOrderDetail', () => {
  it('drops removed lines, uses the current quantity and returns the saved record and digest', async () => {
    const f = shopify(baseOrder([line(), line({ id: 'gid://shopify/LineItem/12', currentQuantity: 0 })]));
    const d = await loadOrderDetail(ORDER, asFetch(f));
    expect(d.name).toBe('#1036');
    expect(d.lines.map((l) => l.id)).toEqual(['gid://shopify/LineItem/11']);
    expect(d.lines[0]).toMatchObject({ quantity: 1, sku: 'HN-OSL', vendor: 'House Nordic', variantTitle: 'Oak' });
    expect(d.lines[0].unit).toEqual({ amount: '119.99', currency: 'GBP' });
    expect(d.lines[0].discount).toEqual({ amount: '38.69', currency: 'GBP' });
    expect(d.lines[0].final).toEqual({ amount: '81.30', currency: 'GBP' });
    expect(d.totals.total).toEqual({ amount: '111.29', currency: 'GBP' });
    expect(d.digest).toBe('D1');
    expect(d.state.schemaVersion).toBe(1);
  });

  it('shows discount and final price as unavailable when the line quantity was edited', () => {
    const f = shopify(baseOrder([line({ quantity: 3, currentQuantity: 2 })]));
    return loadOrderDetail(ORDER, asFetch(f)).then((d) => {
      expect(d.lines[0].quantity).toBe(2);
      expect(d.lines[0].discount).toBeNull();
      expect(d.lines[0].final).toBeNull();
    });
  });

  it('shows every amount with two decimals, as Shopify returns 279.0 and 20.0', async () => {
    const o = baseOrder([line({ originalUnitPriceSet: money('279.0'), discountAllocations: [] })]);
    (o as Record<string, unknown>).currentShippingPriceSet = money('20.0');
    const d = await loadOrderDetail(ORDER, asFetch(shopify(o)));
    expect(d.lines[0].unit).toEqual({ amount: '279.00', currency: 'GBP' });
    expect(d.totals.shipping).toEqual({ amount: '20.00', currency: 'GBP' });
  });

  it('maps missing money fields to null', async () => {
    const o = baseOrder([line({ originalUnitPriceSet: null })]);
    (o as Record<string, unknown>).currentShippingPriceSet = null;
    const d = await loadOrderDetail(ORDER, asFetch(shopify(o)));
    expect(d.lines[0].unit).toBeNull();
    expect(d.lines[0].final).toBeNull();
    expect(d.totals.shipping).toBeNull();
  });

  it('throws the GraphQL error text', async () => {
    await expect(loadOrderDetail(ORDER, asFetch(shopify(null, [{ message: 'Access denied' }])))).rejects.toThrow('Access denied');
  });
});

describe('loadCustomerBlock', () => {
  const address = { name: 'A B', address1: '1 High St', address2: null, city: 'Leeds', zip: 'LS1 1AA', country: 'United Kingdom' };

  it('returns email and address lines without blanks', async () => {
    const f = vi.fn(async () => ({ json: async () => ({ data: { order: { email: 'a@example.com', shippingAddress: address, billingAddress: null } } }) }));
    const c = await loadCustomerBlock(ORDER, asFetch(f));
    expect(c).toEqual({ restricted: false, email: 'a@example.com', shipping: ['A B', '1 High St', 'Leeds', 'LS1 1AA', 'United Kingdom'], billing: [] });
  });

  it('is restricted when Shopify refuses access, whether by error or by a thrown request', async () => {
    const denied = vi.fn(async () => ({ json: async () => ({ data: { order: null }, errors: [{ message: 'not approved for protected customer data' }] }) }));
    expect(await loadCustomerBlock(ORDER, asFetch(denied))).toEqual({ restricted: true });
    const down = vi.fn(async () => { throw new Error('network'); });
    expect(await loadCustomerBlock(ORDER, asFetch(down))).toEqual({ restricted: true });
  });
});
