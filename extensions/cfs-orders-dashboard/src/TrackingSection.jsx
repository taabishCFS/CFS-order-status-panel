import { useState } from 'preact/hooks';
import { applyTracking } from '../../cfs-order-status/src/detailState';
import EmailTick, { sendAfterSave } from './EmailTick.jsx';
import { emailRequest } from './emails';

// Courier tracking number. "Save" records it; with the email tick on it is also sent to the customer.
export default function TrackingSection({ orderId, detail, writer, setNotice, emails }) {
  const { ready, saving, write } = writer;
  const [number, setNumber] = useState('');
  const [emailIt, setEmailIt] = useState(false);
  const current = detail.state.tracking;

  const run = async () => {
    let changeId = '';
    const trimmed = number.trim();
    const ok = await write((state, meta) => {
      changeId = meta.entryId;
      return applyTracking(state, { number: trimmed, ...meta });
    });
    if (!ok) return;
    if (emailIt) {
      await sendAfterSave({ body: emailRequest({ orderId, templateKey: 'tracking', lineIds: detail.lines.map((l) => l.id), extras: { trackingNumber: trimmed }, changeId }), setNotice, emails });
    }
    setNumber('');
    setEmailIt(false);
  };

  return (
    <s-section heading="Tracking">
      <s-stack direction="block" gap="base">
        {current && <s-text>Current tracking number: {current.number} (saved by {current.by.name} on {new Date(current.at).toLocaleString('en-GB')})</s-text>}
        <s-text-field label="Tracking number" value={number} onInput={(e) => setNumber(e.currentTarget.value)} />
        <EmailTick emails={emails} checked={emailIt} onChange={setEmailIt} />
        <s-button variant="primary" disabled={!ready || !number.trim() || undefined} loading={saving || undefined} onClick={run}>{emailIt ? 'Save and email' : 'Save'}</s-button>
      </s-stack>
    </s-section>
  );
}
