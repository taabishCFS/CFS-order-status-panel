import { describe, expect, it } from 'vitest';
import { conditionLabel, conditionOptions, delayRefundPercent, delayRefundMinor } from './conditions';

describe('conditionOptions', () => {
  it('offers the three delivery conditions, and the 50% and 75% refunds only when the order is fully paid', () => {
    expect(conditionOptions(false).map((o) => o.value)).toEqual(['NormalOrder', 'WaitForEntireOrder', 'OKForPartDelivery']);
    expect(conditionOptions(true).map((o) => o.value)).toEqual(['NormalOrder', 'WaitForEntireOrder', 'OKForPartDelivery', '50percRefund', '75percRefund']);
  });
  it('names each condition as the legacy screen does', () => {
    expect(conditionLabel('WaitForEntireOrder')).toBe('WAIT FOR ENTIRE ORDER');
    expect(conditionLabel('75percRefund')).toBe('75% Refund');
    expect(conditionLabel('bogus')).toBe('bogus');
  });
});

describe('delay refunds', () => {
  it('knows which conditions are a delay refund and how much of the total they refund, in whole pence', () => {
    expect(delayRefundPercent('50percRefund')).toBe(50);
    expect(delayRefundPercent('75percRefund')).toBe(75);
    expect(delayRefundPercent('NormalOrder')).toBeNull();
    expect(delayRefundMinor(13463, 75)).toBe(10097);
    expect(delayRefundMinor(10001, 50)).toBe(5001);
  });
});
