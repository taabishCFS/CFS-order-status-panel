import { useState } from 'react';
import { applyDelivery } from '../../extensions/cfs-order-status/src/detailState';
import EmailTick, { sendAfterSave } from './EmailTick.jsx';
import { emailRequest } from './emails';

// Records that the customer confirmed or declined the delivery for the ticked items.
// "Not Confirm" can email the legacy delivery-update message. The confirmation email needs a booked
// delivery date, which this app does not hold yet, so "Confirm" never emails.
export default function DeliverySection({ orderId, picked, writer, setNotice, emails }) {
  const { ready, saving, write } = writer;
  const [emailIt, setEmailIt] = useState(false);
  const run = async (outcome) => {
    let changeId = '';
    const ok = await write((state, meta) => {
      changeId = meta.entryId;
      return applyDelivery(state, { lineIds: picked, outcome, ...meta });
    });
    if (ok && outcome === 'declined' && emailIt) {
      await sendAfterSave({ body: emailRequest({ orderId, templateKey: 'delivery.update', lineIds: picked, changeId }), setNotice, emails });
    }
    if (ok) setEmailIt(false);
  };
  const off = !ready || picked.length === 0 || undefined;

  return (
    <s-section heading="Delivery confirmation">
      <s-stack direction="block" gap="base">
        <s-text>Record the customer's answer for the ticked items.</s-text>
        <EmailTick emails={emails} checked={emailIt} onChange={setEmailIt} />
        <s-text>Only "Delivery Not Confirm" can send an email (the delivery update). Confirming never emails.</s-text>
        {picked.length === 0 && <s-text>Tick at least one item in the table first.</s-text>}
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" disabled={off} loading={saving || undefined} onClick={() => run('confirmed')}>Delivery Confirm</s-button>
          <s-button disabled={off} onClick={() => run('declined')}>Delivery Not Confirm</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
