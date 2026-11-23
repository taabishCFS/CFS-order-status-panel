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
  it('splits discounts into offer, coupons (with code and percent) and adjustments, and reads delivery, paid and balance', async () => {
    const alloc = (amount: string, index: number) => ({ allocatedAmountSet: money(amount), discountApplication: { index } });
    const order = {
      ...baseOrder([
        line({ discountAllocations: [alloc('27.0', 0), alloc('18.36', 1)] }),
        line({ id: 'gid://shopify/LineItem/12', discountAllocations: [alloc('2.0', 2), alloc('1.0', 0)] }),
      ]),
      discountApplications: { nodes: [
        { __typename: 'AutomaticDiscountApplication', targetType: 'LINE_ITEM', title: 'Offer', value: { __typename: 'PricingPercentageValue', percentage: 20 } },
        { __typename: 'DiscountCodeApplication', targetType: 'LINE_ITEM', code: 'BLACK12', value: { __typename: 'PricingPercentageValue', percentage: 12 } },
        { __typename: 'ManualDiscountApplication', targetType: 'LINE_ITEM', title: 'Configuration change', value: { __typename: 'MoneyV2', amount: '2.0' } },
      ] },
      shippingLines: { nodes: [{ title: 'Free Door Delivery', originalPriceSet: money('0.0') }, { title: 'Room of choice', originalPriceSet: money('20.0') }] },
      totalReceivedSet: money('134.63'),
      totalOutstandingSet: money('0.0'),
      totalRefundedSet: money('5.0'),
    };
    const d = await loadOrderDetail(ORDER, asFetch(shopify(order)));
    expect(d.breakdown).toEqual({
      offer: { amount: '28.00', currency: 'GBP' },
      adjustments: { amount: '2.00', currency: 'GBP' },
      coupons: [{ code: 'BLACK12', percent: 12, amount: { amount: '18.36', currency: 'GBP' } }],
      delivery: [{ title: 'Free Door Delivery', price: { amount: '0.00', currency: 'GBP' } }, { title: 'Room of choice', price: { amount: '20.00', currency: 'GBP' } }],
      paid: { amount: '134.63', currency: 'GBP' },
      balance: { amount: '0.00', currency: 'GBP' },
      refunded: { amount: '5.00', currency: 'GBP' },
    });
  });

  it('gives an empty breakdown when Shopify sends none of these fields', async () => {
    const d = await loadOrderDetail(ORDER, asFetch(shopify(baseOrder([line()]))));
    expect(d.breakdown).toEqual({ offer: null, adjustments: null, coupons: [], delivery: [], paid: null, balance: null, refunded: null });
  });

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

  it('splits the discount on each line into the offer (automatic) and the coupon (code) part', async () => {
    const alloc = (amount: string, index: number) => ({ allocatedAmountSet: money(amount), discountApplication: { index } });
    const order = {
      ...baseOrder([line({ discountAllocations: [alloc('27.0', 0), alloc('18.36', 1), alloc('2.0', 2)] }), line({ id: 'gid://shopify/LineItem/12', discountAllocations: [] })]),
      discountApplications: { nodes: [
        { __typename: 'AutomaticDiscountApplication', targetType: 'LINE_ITEM', title: 'Sale', value: { __typename: 'PricingPercentageValue', percentage: 20 } },
        { __typename: 'DiscountCodeApplication', targetType: 'LINE_ITEM', code: 'SAVE10', value: { __typename: 'PricingPercentageValue', percentage: 10 } },
        { __typename: 'ManualDiscountApplication', targetType: 'LINE_ITEM', title: 'Price change', value: { __typename: 'MoneyV2', amount: '2.0' } },
      ] },
    };
    const d = await loadOrderDetail(ORDER, asFetch(shopify(order)));
    expect(d.lines[0]).toMatchObject({ offer: { amount: '27.00' }, coupon: { amount: '18.36' } });
    expect(d.lines[1]).toMatchObject({ offer: { amount: '0.00' }, coupon: { amount: '0.00' } });
  });

  it('leaves delivery service charges (titles marked [svc:...]) out of the items', async () => {
    const f = shopify(baseOrder([line(), line({ id: 'gid://shopify/LineItem/13', title: 'Two Man Delivery [svc:two_man]' })]));
    const d = await loadOrderDetail(ORDER, asFetch(f));
    expect(d.lines.map((l) => l.id)).toEqual(['gid://shopify/LineItem/11']);
  });

  it('shows a service charge as a delivery row and keeps it out of the subtotal', async () => {
    const svc = line({ id: 'gid://shopify/LineItem/13', title: 'Two Man Delivery [svc:two_man]', originalUnitPriceSet: money('20.0'), discountAllocations: [] });
    const gone = line({ id: 'gid://shopify/LineItem/14', title: 'White Glove [svc:white_glove]', originalUnitPriceSet: money('60.0'), currentQuantity: 0, discountAllocations: [] });
    const order = { ...baseOrder([line(), svc, gone]), currentSubtotalPriceSet: money('139.99'), shippingLines: { nodes: [{ title: 'Free Door Delivery', originalPriceSet: money('0.0') }] } };
    const d = await loadOrderDetail(ORDER, asFetch(shopify(order)));
    expect(d.totals.subtotal).toEqual({ amount: '119.99', currency: 'GBP' });
    expect(d.breakdown.delivery).toEqual([{ title: 'Free Door Delivery', price: { amount: '0.00', currency: 'GBP' } }, { title: 'Two Man Delivery', price: { amount: '20.00', currency: 'GBP' } }]);
  });

  it('multiplies a service charge by its quantity and shows no Delivery fallback row when only services exist', async () => {
    const svc = line({ id: 'gid://shopify/LineItem/13', title: 'Scotland Delivery [svc:scotland]', originalUnitPriceSet: money('15.0'), quantity: 2, currentQuantity: 2, discountAllocations: [] });
    const d = await loadOrderDetail(ORDER, asFetch(shopify({ ...baseOrder([line(), svc]), currentSubtotalPriceSet: money('149.99') })));
    expect(d.breakdown.delivery).toEqual([{ title: 'Scotland Delivery', price: { amount: '30.00', currency: 'GBP' } }]);
    expect(d.totals.subtotal?.amount).toBe('119.99');
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
    expect(c).toMatchObject({ restricted: false, email: 'a@example.com', shipping: ['A B', '1 High St', 'Leeds', 'LS1 1AA', 'United Kingdom'], billing: [] });
  });

  it('returns editable address fields, phone and the order information block', async () => {
    const full = { name: 'A B', address1: '1 High St', address2: null, city: 'Leeds', province: 'West Yorkshire', provinceCode: 'WYK', zip: 'LS1 1AA', country: 'United Kingdom', countryCodeV2: 'GB', phone: '07700900123' };
    const f = vi.fn(async () => ({ json: async () => ({ data: { order: { email: 'a@example.com', phone: null, note: 'Leave in the porch', sourceName: 'web', clientIp: '2a02::1', paymentGatewayNames: ['Kody', 'gift_card'], customerJourneySummary: { firstVisit: { source: 'Adwords' } }, shippingAddress: full, billingAddress: null } } }) }));
    const c = await loadCustomerBlock(ORDER, asFetch(f));
    expect(c).toMatchObject({
      restricted: false,
      phone: '07700900123',
      shippingFields: { name: 'A B', address1: '1 High St', address2: '', city: 'Leeds', province: 'West Yorkshire', provinceCode: 'WYK', zip: 'LS1 1AA', country: 'United Kingdom', countryCode: 'GB', phone: '07700900123' },
      billingFields: null,
      info: { source: 'Adwords', payment: 'Kody, gift_card', ip: '2a02::1', customerNote: 'Leave in the porch' },
    });
  });

  it('names the app when the sales channel is only a number, and shows nothing when the app is unknown', async () => {
    const reply = (app: unknown) => vi.fn(async () => ({ json: async () => ({ data: { order: { email: null, phone: null, note: null, sourceName: '341262598145', app, clientIp: null, paymentGatewayNames: [], customerJourneySummary: null, shippingAddress: null, billingAddress: null } } }) }));
    expect(await loadCustomerBlock(ORDER, asFetch(reply({ name: 'Draft Orders' })))).toMatchObject({ info: { source: 'Draft Orders' } });
    expect(await loadCustomerBlock(ORDER, asFetch(reply(null)))).toMatchObject({ info: { source: null } });
  });

  it('falls back to the sales channel when there is no traffic source, and to blanks when nothing is known', async () => {
    const f = vi.fn(async () => ({ json: async () => ({ data: { order: { email: null, phone: null, note: null, sourceName: 'web', clientIp: null, paymentGatewayNames: [], customerJourneySummary: null, shippingAddress: null, billingAddress: null } } }) }));
    const c = await loadCustomerBlock(ORDER, asFetch(f));
    expect(c).toMatchObject({ phone: null, info: { source: 'web', payment: '', ip: null, customerNote: '' } });
  });

  it('is restricted when Shopify refuses access, whether by error or by a thrown request', async () => {
    const denied = vi.fn(async () => ({ json: async () => ({ data: { order: null }, errors: [{ message: 'not approved for protected customer data' }] }) }));
    expect(await loadCustomerBlock(ORDER, asFetch(denied))).toEqual({ restricted: true });
    const down = vi.fn(async () => { throw new Error('network'); });
    expect(await loadCustomerBlock(ORDER, asFetch(down))).toEqual({ restricted: true });
  });
});
