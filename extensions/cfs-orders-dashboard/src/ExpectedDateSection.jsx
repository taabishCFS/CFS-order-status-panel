import { useState } from 'preact/hooks';
import { applyExpectedDate } from '../../cfs-order-status/src/detailState';
import EmailTick, { sendAfterSave } from './EmailTick.jsx';
import { emailDate, emailRequest } from './emails';

// Sets or clears the expected date on the ticked items, and can email the customer the new date.
export default function ExpectedDateSection({ orderId, picked, writer, setNotice, emails }) {
  const { ready, saving, write } = writer;
  const [date, setDate] = useState('');
  const [emailIt, setEmailIt] = useState(false);

  const run = async (value) => {
    let changeId = '';
    const ok = await write((state, meta) => {
      changeId = meta.entryId;
      return applyExpectedDate(state, { lineIds: picked, date: value, ...meta });
    });
    if (!ok) return;
    if (value && emailIt) {
      const shown = emailDate(value);
      const lineExtras = Object.fromEntries(picked.map((id) => [id, { expectedDate: shown }]));
      await sendAfterSave({ body: emailRequest({ orderId, templateKey: 'expected_date', lineIds: picked, extras: { expectedDate: shown }, lineExtras, changeId }), setNotice, emails });
    }
    setDate('');
    setEmailIt(false);
  };

  return (
    <s-section heading="Expected date">
      <s-stack direction="block" gap="base">
        <s-date-field label="Expected date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        {picked.length === 0 && <s-text>Tick at least one item in the table first.</s-text>}
        <EmailTick emails={emails} checked={emailIt} onChange={setEmailIt} />
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" disabled={!ready || picked.length === 0 || !date || undefined} loading={saving || undefined} onClick={() => run(date)}>Save date</s-button>
          <s-button disabled={!ready || picked.length === 0 || undefined} onClick={() => run(null)}>Clear date</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
