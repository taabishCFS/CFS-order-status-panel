import { describe, expect, it } from 'vitest';
import { expandView } from './orderExpand';
import type { OrderDetail } from './orderDetail';

const m = (amount: string) => ({ amount, currency: 'GBP' });

function detail(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'gid://shopify/Order/1',
    name: '#1036',
    createdAt: '2026-11-18T09:44:12Z',
    lines: [
      { id: 'L1', title: 'Oslo Sideboard', variantTitle: 'Oak', sku: 'HN-OSL', vendor: 'House Nordic', quantity: 2, unit: m('100.00'), discount: m('30.00'), offer: m('20.00'), coupon: m('10.00'), final: m('170.00') },
      { id: 'L2', title: 'Plain Shelf', variantTitle: null, sku: null, vendor: null, quantity: 1, unit: m('50.00'), discount: null, offer: null, coupon: null, final: null },
    ],
    totals: { subtotal: m('250.00'), discounts: m('30.00'), shipping: m('10.00'), total: m('230.00') },
    breakdown: { offer: m('20.00'), adjustments: null, coupons: [{ code: 'SAVE10', percent: 10, amount: m('10.00') }], delivery: [], paid: m('230.00'), balance: m('0.00'), refunded: null },
    state: { schemaVersion: 2, order: null, lines: { L1: { statusId: 4 } }, history: [], expected: { L1: { date: '2026-12-25' } } } as unknown as OrderDetail['state'],
    digest: null,
    ...over,
  };
}

describe('expandView', () => {
  it('lists each line the way the legacy expanded row does, with dd/mm/yyyy dates and --- when empty', () => {
    const { rows } = expandView(detail());
    expect(rows[0]).toEqual({
      id: 'L1', product: 'Oslo Sideboard (Oak)', brand: 'House Nordic', unit: '£100.00', qty: 2,
      expected: '25/12/2026', delivery: '---', status: 'In Stock', total: '£200.00', offer: '- £20.00', coupon: '- £10.00', final: '£170.00',
    });
    expect(rows[1]).toMatchObject({ product: 'Plain Shelf', brand: '---', expected: '---', status: 'Not set', total: '£50.00', offer: '---', coupon: '---', final: '---' });
  });

  it('shows the legacy totals: subtotal, offer, coupon with code and percent, grand total', () => {
    const { totals } = expandView(detail());
    expect(totals).toEqual([
      { label: 'Subtotal', value: '£250.00' },
      { label: 'Offer discount', value: '(-) £20.00' },
      { label: 'Coupon [SAVE10] [10 %]', value: '(-) £10.00' },
      { label: 'Grand Total', value: '£230.00' },
    ]);
  });

  it('leaves out the offer and coupon rows when the order has none', () => {
    const { totals } = expandView(detail({ breakdown: { offer: null, adjustments: null, coupons: [], delivery: [], paid: null, balance: null, refunded: null } }));
    expect(totals.map((t) => t.label)).toEqual(['Subtotal', 'Grand Total']);
  });
});
