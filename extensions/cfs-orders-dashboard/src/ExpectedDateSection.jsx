import { useState } from 'preact/hooks';
import { applyExpectedDate } from '../../cfs-order-status/src/detailState';

// Sets or clears the expected date on the ticked items. Customer email is not available yet.
export default function ExpectedDateSection({ picked, writer }) {
  const { ready, saving, write } = writer;
  const [date, setDate] = useState('');

  const run = async (value) => {
    const ok = await write((state, meta) => applyExpectedDate(state, { lineIds: picked, date: value, ...meta }));
    if (ok) setDate('');
  };

  return (
    <s-section heading="Expected date">
      <s-stack direction="block" gap="base">
        <s-date-field label="Expected date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        {picked.length === 0 && <s-text>Tick at least one item in the table first.</s-text>}
        <s-checkbox label="Email the customer (not available yet)" disabled checked={false} />
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" disabled={!ready || picked.length === 0 || !date || undefined} loading={saving || undefined} onClick={() => run(date)}>Save date</s-button>
          <s-button disabled={!ready || picked.length === 0 || undefined} onClick={() => run(null)}>Clear date</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
