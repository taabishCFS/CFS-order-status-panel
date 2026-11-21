// "Update Conditions" on an order: how a delayed order is handled. The 50% and 75% refunds are only offered once the order is fully paid.
const CONDITIONS = [
  { value: 'NormalOrder', label: 'Normal Order', refund: false },
  { value: 'WaitForEntireOrder', label: 'WAIT FOR ENTIRE ORDER', refund: false },
  { value: 'OKForPartDelivery', label: 'OK FOR PART DELIVERY', refund: false },
  { value: '50percRefund', label: '50% Refund', refund: true },
  { value: '75percRefund', label: '75% Refund', refund: true },
] as const;

export const conditionOptions = (fullyPaid: boolean): { value: string; label: string }[] =>
  CONDITIONS.filter((c) => fullyPaid || !c.refund).map(({ value, label }) => ({ value, label }));

export const isCondition = (value: string): boolean => CONDITIONS.some((c) => c.value === value);
export const conditionLabel = (value: string): string => CONDITIONS.find((c) => c.value === value)?.label ?? value;

export const delayRefundPercent = (value: string): 50 | 75 | null => (value === '50percRefund' ? 50 : value === '75percRefund' ? 75 : null);

/** The part of the order total a delay refund returns, in whole pence. */
export const delayRefundMinor = (totalMinor: number, percent: number): number => Math.round((totalMinor * percent) / 100);
