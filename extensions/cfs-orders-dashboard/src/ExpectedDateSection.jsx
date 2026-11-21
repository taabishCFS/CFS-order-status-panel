import { useState } from 'preact/hooks';
import { conditionLabel, conditionOptions, delayRefundMinor, delayRefundPercent } from '../../cfs-order-status/src/conditions';
import { applyCondition, applyExpectedDate, applyRefundRequest } from '../../cfs-order-status/src/detailState';
import EmailTick, { sendAfterSave } from './EmailTick.jsx';
import { emailDate, emailRequest } from './emails';
import { addRefund, moneyText, refundSummary } from './refunds';

// Sets or clears the expected date on the ticked items, and can email the customer the new date.
export default function ExpectedDateSection({ id, orderId, detail, verified, picked, writer, setNotice, emails }) {
  const { ready, saving, write } = writer;
  const [date, setDate] = useState('');
  const [emailIt, setEmailIt] = useState(false);
  const [condition, setCondition] = useState(detail.state.condition?.value ?? '');
  const [conditionError, setConditionError] = useState(null);
  const fullyPaid = detail.breakdown.balance !== null && Number(detail.breakdown.balance.amount) === 0;
  const percent = delayRefundPercent(condition);
  const conditionChanged = condition !== '' && condition !== (detail.state.condition?.value ?? '');

  // A 50% or 75% condition first asks for the refund; if that is refused nothing is changed.
  const saveCondition = async () => {
    setConditionError(null);
    let refund = null;
    if (percent) {
      const total = Math.round(Number(detail.totals.total?.amount ?? '0') * 100);
      const res = await addRefund(id, { clientKey: `${orderId}:${condition}:${detail.state.history.length}`, reason: 'DelayRefund', type: 'part', amount: moneyText(delayRefundMinor(total, percent)), lineIds: [], notes: `Update conditions: ${conditionLabel(condition)}` });
      if (!res.ok) { setConditionError(res.message); return; }
      refund = res.request;
    }
    await writer.write((state, meta) => {
      const next = applyCondition(state, { value: condition, ...meta });
      return refund ? applyRefundRequest(next, { ...meta, entryId: `${meta.entryId}-refund`, summary: refundSummary(refund.type, refund.amountMinor, refund.reason), notes: `Update conditions: ${conditionLabel(condition)}` }) : next;
    });
  };

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
        <s-stack direction="block" gap="small">
          <s-select label="Update conditions" value={condition} onChange={(e) => { setCondition(e.currentTarget.value); setConditionError(null); }}>
            <s-option value="">-- Update Conditions --</s-option>
            {conditionOptions(fullyPaid).map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
          </s-select>
          {percent && <s-text color="subdued">Saving this also adds a {percent}% refund request for £{moneyText(delayRefundMinor(Math.round(Number(detail.totals.total?.amount ?? '0') * 100), percent))} (reason: Delay Refund).</s-text>}
          {conditionError && <s-banner tone="critical" dismissible onDismiss={() => setConditionError(null)}>{conditionError}</s-banner>}
          {percent && !verified && <s-text color="subdued">A refund condition needs a verified Shopify staff sign-in.</s-text>}
          <s-button disabled={!ready || !conditionChanged || (percent && !verified) || undefined} loading={saving || undefined} onClick={saveCondition}>Save condition</s-button>
        </s-stack>
        <s-divider />
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
