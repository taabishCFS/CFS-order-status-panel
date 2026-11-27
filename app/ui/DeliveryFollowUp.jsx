import { useState } from 'react';
import { notConfirmedText, rescheduleLines, rescheduleText, sendNotConfirmed, tomorrow } from './deliveryFollowUp';

// The Bulk Reschedule and Not Confirmed Email buttons of a delivery page. `lineIds`: the ticked lines.
// Returns { buttons, panel }: put the buttons with the page's other buttons and the panel where it should open.
// onDone({ tone, text }, reload): show the result; reload is true when the list changed.
export function useFollowUp({ lineIds, page, onDone }) {
  const [open, setOpen] = useState(null); // 'reschedule' | 'notConfirmed'
  const [date, setDate] = useState(tomorrow());
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(null);
  const n = lineIds.length;
  const toggle = (which) => {
    if (n === 0) { onDone({ tone: 'warning', text: 'Please Select Record(s).' }, false); return; }
    setOpen(open === which ? null : which);
  };

  async function reschedule() {
    if (!date) { onDone({ tone: 'warning', text: 'Choose the new delivery date.' }, false); return; }
    setBusy('reschedule');
    const res = await rescheduleLines(lineIds, date, page, email);
    setBusy(null);
    if (!res.ok) { onDone({ tone: 'critical', text: res.message }, false); return; }
    setOpen(null);
    onDone({ tone: 'success', text: rescheduleText(res.data, date, email) }, true);
  }
  async function notConfirmed() {
    setBusy('notConfirmed');
    const res = await sendNotConfirmed(lineIds);
    setBusy(null);
    if (!res.ok) { onDone({ tone: 'critical', text: res.message }, false); return; }
    setOpen(null);
    onDone({ tone: 'success', text: notConfirmedText(res.data) }, true);
  }

  const buttons = (
    <>
      <s-button onClick={() => toggle('reschedule')}>Bulk Reschedule</s-button>
      <s-button onClick={() => toggle('notConfirmed')}>Not Confirmed Email</s-button>
    </>
  );

  const panel =
    open === 'reschedule' && n > 0 ? (
      <s-section heading={`Bulk Reschedule: ${n} ticked line${n === 1 ? '' : 's'}`}>
        <s-stack direction="block" gap="base">
          <s-text color="subdued">The ticked lines move to the new date. Van, driver, drop and slot stay as they are. Any earlier confirmation is cleared, as the customer needs to confirm the new date.</s-text>
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="New delivery date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
            <s-checkbox label="Email the customers the new date with a confirm link" checked={email || undefined} onChange={(e) => setEmail(e.currentTarget.checked)} />
          </s-stack>
          <s-stack direction="inline" gap="small">
            <s-button variant="primary" loading={busy === 'reschedule' || undefined} disabled={(busy && busy !== 'reschedule') || undefined} onClick={reschedule}>Reschedule</s-button>
            <s-button disabled={busy || undefined} onClick={() => setOpen(null)}>Cancel</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    ) : open === 'notConfirmed' && n > 0 ? (
      <s-section heading={`Not Confirmed Email: ${n} ticked line${n === 1 ? '' : 's'}`}>
        <s-stack direction="block" gap="base">
          <s-text color="subdued">One email per order: we did not get their delivery confirmation and will arrange another delivery within the next 24-72 hours. Nothing else changes. The wording is on Email Templates (Delivery not confirmed).</s-text>
          <s-stack direction="inline" gap="small">
            <s-button variant="primary" loading={busy === 'notConfirmed' || undefined} disabled={(busy && busy !== 'notConfirmed') || undefined} onClick={notConfirmed}>Send emails</s-button>
            <s-button disabled={busy || undefined} onClick={() => setOpen(null)}>Cancel</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    ) : null;

  return { buttons, panel };
}
