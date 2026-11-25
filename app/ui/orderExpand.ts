// The expanded row of the Orders list (legacy getOrderDetailsExpand.php): the order's lines and its totals, as display text.
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import { expectedOf } from '../../extensions/cfs-order-status/src/lineInfo';
import type { Money, OrderDetail } from './orderDetail';

export interface ExpandRow {
  id: string;
  product: string;
  brand: string;
  unit: string;
  qty: number;
  expected: string;
  delivery: string;
  status: string;
  total: string;
  offer: string;
  coupon: string;
  final: string;
}

const NONE = '---';
const minor = (amount: string): number => Math.round(Number(amount) * 100);
const show = (m: Money | null): string => (m ? text(minor(m.amount), m.currency) : NONE);
const text = (pence: number, currency: string): string => {
  const amount = (pence / 100).toFixed(2);
  return currency === 'GBP' ? `£${amount}` : `${currency} ${amount}`;
};
const dmy = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : NONE);
// A discount shows as "- £x", or --- when there is none (as the legacy screen does).
const taken = (m: Money | null): string => (m && minor(m.amount) > 0 ? `- ${show(m)}` : NONE);

export function expandView(d: OrderDetail): { rows: ExpandRow[]; totals: { label: string; value: string }[] } {
  const rows = d.lines.map((l): ExpandRow => ({
    id: l.id,
    product: l.variantTitle ? `${l.title} (${l.variantTitle})` : l.title,
    brand: l.vendor || NONE,
    unit: show(l.unit),
    qty: l.quantity,
    expected: dmy(expectedOf(d.state, l.id)),
    // Legacy "Delivery Date" is the booked delivery date; the booking feature is not built yet.
    delivery: NONE,
    status: d.state.lines[l.id] ? labelFor(d.state.lines[l.id].statusId) : 'Not set',
    total: l.unit ? text(minor(l.unit.amount) * l.quantity, l.unit.currency) : NONE,
    offer: taken(l.offer),
    coupon: taken(l.coupon),
    final: show(l.final),
  }));

  const totals: { label: string; value: string }[] = [{ label: 'Subtotal', value: show(d.totals.subtotal) }];
  if (d.breakdown.offer && minor(d.breakdown.offer.amount) > 0) totals.push({ label: 'Offer discount', value: `(-) ${show(d.breakdown.offer)}` });
  for (const c of d.breakdown.coupons) {
    const percent = c.percent === null ? '' : ` [${c.percent} %]`;
    totals.push({ label: `Coupon [${c.code}]${percent}`, value: `(-) ${show(c.amount)}` });
  }
  totals.push({ label: 'Grand Total', value: show(d.totals.total) });
  return { rows, totals };
}
