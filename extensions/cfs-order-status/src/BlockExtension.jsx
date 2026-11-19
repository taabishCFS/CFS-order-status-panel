import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { deliveryOf, expectedOf } from './lineInfo';
import { labelFor } from './statuses';
import { lineText, useOrderStatus } from './useOrderStatus';

export default async () => {
  render(<Extension />, document.body);
};

// Compact summary. The update form and history open in the action dialog, because
// Shopify clips tall blocks.
function Extension() {
  const orderId = shopify.data.selected[0].id;
  const { lines, state, loading, notice, refresh, removed, removedInfo } = useOrderStatus(orderId);

  return (
    <s-admin-block heading="CFS Order Status">
      <s-stack direction="block" gap="base">
        {notice && (
          <s-banner tone={notice.tone}>
            {notice.text}
            <s-button slot="secondary-actions" onClick={refresh}>Retry</s-button>
          </s-banner>
        )}
        {loading ? <s-text>Loading…</s-text> : (
          <>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text type="strong">Order status:</s-text>
              <s-badge>{state.order ? labelFor(state.order.statusId) : 'Not set'}</s-badge>
            </s-stack>
            <s-stack direction="block" gap="small">
              {lines.map((l) => (
                <s-stack key={l.id} direction="inline" gap="small" alignItems="center">
                  <s-text>{lineText(l)}</s-text>
                  <s-badge>{state.lines[l.id] ? labelFor(state.lines[l.id].statusId) : 'Not set'}</s-badge>
                  {expectedOf(state, l.id) && <s-text>Expected {expectedOf(state, l.id).split('-').reverse().join('/')}</s-text>}
                  {deliveryOf(state, l.id) && <s-text>Delivery {deliveryOf(state, l.id)}</s-text>}
                </s-stack>
              ))}
              {removed.map((id) => (
                <s-stack key={id} direction="inline" gap="small" alignItems="center">
                  <s-text>{removedInfo[id] ? `${removedInfo[id].title}${removedInfo[id].variantTitle ? ` (${removedInfo[id].variantTitle})` : ''} - removed from order` : 'Removed from order'}</s-text>
                  <s-badge>{labelFor(state.lines[id].statusId)}</s-badge>
                </s-stack>
              ))}
            </s-stack>
            <s-button variant="primary" href="extension:cfs-order-status-update">
              Update status and history ({state.totalEntries ?? state.history.length})
            </s-button>
          </>
        )}
      </s-stack>
    </s-admin-block>
  );
}
