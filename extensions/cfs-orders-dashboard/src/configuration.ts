// Pure helpers for the Configuration panel on Order Detail: what a configuration says, how the
// option picker maps to a request, and plain-English messages. No network and no page code here.

export interface Option {
  group: string;
  label: string;
  cfsId: string;
  quantity: number;
  cents: number;
}

export interface Configuration {
  baseCents: number;
  unitCents: number;
  options: Option[];
}

// One pick per group (group name -> choice id) and a quantity for choices wanted more than once.
export interface Selection {
  picks: Record<string, string>;
  quantities: Record<string, number>;
}

export interface Group {
  name: string;
  optional: boolean;
}

export function summarise(config: Configuration | null): string {
  if (!config) return 'Not available';
  if (config.options.length === 0) return 'No options';
  return config.options.map((o) => `${o.group}: ${o.label}${o.quantity > 1 ? ` x${o.quantity}` : ''}`).join(', ');
}

// The picker shows one choice per group. A configuration with several in one group is not shown.
export function selectionFromConfiguration(config: Configuration | null): Selection | null {
  if (!config) return null;
  const picks: Record<string, string> = {};
  const quantities: Record<string, number> = {};
  for (const o of config.options) {
    if (Object.prototype.hasOwnProperty.call(picks, o.group)) return null;
    picks[o.group] = o.cfsId;
    if (o.quantity > 1) quantities[o.cfsId] = o.quantity;
  }
  return { picks, quantities };
}

// The request body parts the backend expects. `groupOrder` fixes the order of the choice ids.
export function selectionToRequest(sel: Selection, groupOrder: string[]): { choiceIds: string[]; quantities: Record<string, number> } {
  const names = [...groupOrder, ...Object.keys(sel.picks).filter((g) => !groupOrder.includes(g))];
  const choiceIds = names.map((g) => sel.picks[g]).filter((id): id is string => Boolean(id));
  const quantities: Record<string, number> = {};
  for (const id of choiceIds) {
    const n = sel.quantities[id];
    if (Number.isInteger(n) && n > 1) quantities[id] = n;
  }
  return { choiceIds, quantities };
}

export function canQuote(sel: Selection, groups: Group[]): boolean {
  return groups.every((g) => g.optional || Boolean(sel.picks[g.name]));
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100);
}

export function formatDelta(minor: number, currency: string): string {
  if (minor === 0) return 'No price change';
  return `${minor > 0 ? '+' : '-'}${formatMoney(Math.abs(minor), currency)}`;
}

const REASONS: Record<string, string> = {
  no_matching_checkout: "This order did not come from the configurator checkout, so its options can't be changed here.",
  no_snapshot: 'There is no configurator record for this order.',
  order_cancelled: 'This order is cancelled.',
  not_configured: 'This item is not a configured product.',
  line_fulfilled: 'This item has been fulfilled.',
  line_not_found: 'This item was not found on the order.',
  change_pending: 'A change to this item is still being saved. Try again in a minute.',
};

export const reasonText = (code: string): string => REASONS[code] ?? code;

export function outcomeText(outcome: string, message?: string): string {
  switch (outcome) {
    case 'applied':
      return 'Change applied.';
    case 'unchanged':
      return 'These are already the current options. Nothing to change.';
    case 'stale':
      return 'This item was changed by someone else. Reload and try again.';
    case 'invalid':
      return message === 'reason_required' ? 'Enter a reason for the change.' : `The configurator refused this combination (${message ?? 'invalid'}).`;
    case 'not_editable':
      return reasonText(message ?? 'not_editable');
    default:
      return `The change could not be completed (${message ?? 'unknown error'}). Nothing was changed.`;
  }
}
