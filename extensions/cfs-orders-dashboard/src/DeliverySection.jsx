import { applyDelivery } from '../../cfs-order-status/src/detailState';

// Records that the customer confirmed or declined the delivery for the ticked items.
// Nothing is emailed in this phase; the page says so.
export default function DeliverySection({ picked, writer }) {
  const { ready, saving, write } = writer;
  const run = (outcome) => write((state, meta) => applyDelivery(state, { lineIds: picked, outcome, ...meta }));
  const off = !ready || picked.length === 0 || undefined;

  return (
    <s-section heading="Delivery confirmation">
      <s-stack direction="block" gap="base">
        <s-text>Record the customer's answer for the ticked items. The customer is not emailed.</s-text>
        {picked.length === 0 && <s-text>Tick at least one item in the table first.</s-text>}
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" disabled={off} loading={saving || undefined} onClick={() => run('confirmed')}>Delivery Confirm</s-button>
          <s-button disabled={off} onClick={() => run('declined')}>Delivery Not Confirm</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
