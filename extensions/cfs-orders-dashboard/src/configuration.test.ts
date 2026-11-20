import { describe, expect, it } from 'vitest';
import {
  canQuote,
  formatDelta,
  formatMoney,
  outcomeText,
  reasonText,
  selectionFromConfiguration,
  selectionToRequest,
  summarise,
  type Configuration,
} from './configuration';

const config: Configuration = {
  baseCents: 99999,
  unitCents: 112999,
  options: [
    { group: 'Select Drawer', label: 'with 2 Drawer', cfsId: '17020886', quantity: 1, cents: 8999 },
    { group: 'Select Fabric', label: 'Carlton Caramel', cfsId: '17020903', quantity: 1, cents: 4001 },
  ],
};

describe('summarise', () => {
  it('lists group: choice in order, with a quantity only above one', () => {
    expect(summarise(config)).toBe('Select Drawer: with 2 Drawer, Select Fabric: Carlton Caramel');
    expect(summarise({ ...config, options: [{ group: 'Extras', label: 'Cushion', cfsId: '1', quantity: 3, cents: 0 }] })).toBe('Extras: Cushion x3');
  });

  it('says so when there is no configuration', () => {
    expect(summarise(null)).toBe('Not available');
    expect(summarise({ ...config, options: [] })).toBe('No options');
  });
});

describe('selectionFromConfiguration', () => {
  it('maps each group to its one choice, and quantities above one by choice id', () => {
    expect(selectionFromConfiguration(config)).toEqual({ picks: { 'Select Drawer': '17020886', 'Select Fabric': '17020903' }, quantities: {} });
    const acc = { ...config, options: [{ group: 'Extras', label: 'Cushion', cfsId: '5', quantity: 2, cents: 100 }] };
    expect(selectionFromConfiguration(acc)).toEqual({ picks: { Extras: '5' }, quantities: { 5: 2 } });
  });

  it('is null when a group holds several choices (the picker cannot show that), or there is no configuration', () => {
    const two = { ...config, options: [...config.options, { group: 'Select Fabric', label: 'Other', cfsId: '9', quantity: 1, cents: 0 }] };
    expect(selectionFromConfiguration(two)).toBeNull();
    expect(selectionFromConfiguration(null)).toBeNull();
  });
});

describe('selectionToRequest', () => {
  const groups = ['Select Drawer', 'Select Fabric', 'Extras'];

  it('lists the picked choices in group order, skipping empty picks', () => {
    const sel = { picks: { 'Select Fabric': '17020903', 'Select Drawer': '17020886', Extras: '' }, quantities: {} };
    expect(selectionToRequest(sel, groups)).toEqual({ choiceIds: ['17020886', '17020903'], quantities: {} });
  });

  it('sends quantities above one, only for choices that are picked', () => {
    const sel = { picks: { Extras: '5' }, quantities: { 5: 2, 7: 4, 5.5: 1 } };
    expect(selectionToRequest(sel, groups)).toEqual({ choiceIds: ['5'], quantities: { 5: 2 } });
    expect(selectionToRequest({ picks: { Extras: '5' }, quantities: { 5: 1 } }, groups).quantities).toEqual({});
  });
});

describe('canQuote', () => {
  const groups = [
    { name: 'Select Drawer', optional: false },
    { name: 'Select Fabric', optional: false },
    { name: 'Extras', optional: true },
  ];

  it('needs a pick for every group that is not optional', () => {
    expect(canQuote({ picks: { 'Select Drawer': '1', 'Select Fabric': '2' }, quantities: {} }, groups)).toBe(true);
    expect(canQuote({ picks: { 'Select Drawer': '1' }, quantities: {} }, groups)).toBe(false);
    expect(canQuote({ picks: { 'Select Drawer': '1', 'Select Fabric': '' }, quantities: {} }, groups)).toBe(false);
  });
});

describe('money text', () => {
  it('formats pence as a currency amount', () => {
    expect(formatMoney(14000, 'GBP')).toBe('£140.00');
    expect(formatMoney(5, 'GBP')).toBe('£0.05');
  });

  it('shows a signed difference, or says there is none', () => {
    expect(formatDelta(14000, 'GBP')).toBe('+£140.00');
    expect(formatDelta(-7050, 'GBP')).toBe('-£70.50');
    expect(formatDelta(0, 'GBP')).toBe('No price change');
  });
});

describe('plain-English messages', () => {
  it('explains why a line cannot be edited', () => {
    expect(reasonText('no_matching_checkout')).toMatch(/configurator checkout/);
    expect(reasonText('order_cancelled')).toMatch(/cancelled/);
    expect(reasonText('line_fulfilled')).toMatch(/fulfilled/);
    expect(reasonText('change_pending')).toMatch(/still being saved/);
    expect(reasonText('something_new')).toBe('something_new');
  });

  it('explains each outcome and says nothing was changed when it failed', () => {
    expect(outcomeText('applied')).toMatch(/applied/i);
    expect(outcomeText('unchanged')).toMatch(/already/i);
    expect(outcomeText('stale')).toMatch(/changed by someone else/i);
    expect(outcomeText('invalid', 'reason_required')).toBe('Enter a reason for the change.');
    expect(outcomeText('invalid', 'invalid_combination')).toMatch(/invalid_combination/);
    expect(outcomeText('not_editable', 'order_cancelled')).toMatch(/cancelled/);
    expect(outcomeText('failed', 'Order changed')).toMatch(/Order changed/);
    expect(outcomeText('failed', 'Order changed')).toMatch(/Nothing was changed/);
  });
});
