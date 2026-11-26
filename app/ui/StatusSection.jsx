import { useState } from 'react';
import { canSave } from '../../extensions/cfs-order-status/src/canSave';
import { headerProposal } from '../../extensions/cfs-order-status/src/detailState';
import { applyChange } from '../../extensions/cfs-order-status/src/state';
import { STATUSES, labelFor, statusById } from '../../extensions/cfs-order-status/src/statuses';
import { syncStatusTag } from '../../extensions/cfs-order-status/src/tags';
import EmailTick, { sendAfterSave } from './EmailTick.jsx';
import { emailRequest, statusEmailInput } from './emails';

// Whole-order and per-line status, with the legacy rule that a line save may propose the order status.
export default function StatusSection({ orderId, detail, picked, loading, loadFailed, writer, setNotice, emails }) {
  const { saving, ready, write } = writer;
  // The save state is shared by every section of the order page, so only the button pressed here shows loading.
  const [mine, setMine] = useState(false);
  const track = (fn) => async (...args) => { setMine(true); try { await fn(...args); } finally { setMine(false); } };
  const [scope, setScope] = useState('order');
  const [statusId, setStatusId] = useState('');
  const [declined, setDeclined] = useState(null);
  const [emailIt, setEmailIt] = useState(false);
  const [extras, setExtras] = useState({ cancelReason: '', creditNoteAmount: '', serviceRemarks: '' });
  const setExtra = (key) => (e) => setExtras((x) => ({ ...x, [key]: e.currentTarget.value }));

  const lineIds = detail.lines.map((l) => l.id);
  const proposal = headerProposal(detail.state, lineIds);
  const showProposal = proposal !== null && declined !== proposal;
  // Legacy: status 1 (Payment Process) never changes a line, so it is refused here instead of silently ignored.
  const blocked = scope === 'lines' && statusId === '1';
  const canSaveNow = ready && !blocked && canSave({ saving, loading, loadFailed, statusId, scope, pickedCount: picked.length });

  async function save(forScope, status, ids, email = false) {
    // Work out the email from the record as it is now, before the save refreshes it.
    const input = statusEmailInput({ state: detail.state, allLineIds: lineIds, scope: forScope, lineIds: ids, statusId: status.id });
    let changeId = '';
    const ok = await write((state, meta) => {
      changeId = meta.entryId;
      return applyChange(state, { scope: forScope, lineIds: ids, status, extras, allLineIds: lineIds, ...meta });
    });
    if (!ok) return;
    if (email) await sendAfterSave({ body: emailRequest({ orderId, statusId: status.id, ...input, changeId }), setNotice, emails });
    if (forScope === 'order') {
      const tag = await syncStatusTag(orderId, status.label);
      if (!tag.ok) setNotice({ tone: 'warning', text: `Status saved, but the order tag for the Orders list could not be updated: ${tag.message}` });
    }
  }

  async function onSave() {
    const status = statusById(Number(statusId));
    setDeclined(null);
    await save(scope, status, picked, emailIt);
    setStatusId('');
    setEmailIt(false);
    setExtras({ cancelReason: '', creditNoteAmount: '', serviceRemarks: '' });
  }

  return (
    <s-section heading="Status">
      <s-stack direction="block" gap="base">
        {showProposal && (
          <s-banner tone="info" heading={`All items are now ${labelFor(proposal)}`}>
            Set the order status to {labelFor(proposal)}?
            <s-button slot="primary-action" disabled={!ready || undefined} onClick={() => save('order', statusById(proposal), [])}>Set order status</s-button>
            <s-button slot="secondary-actions" onClick={() => setDeclined(proposal)}>Not now</s-button>
          </s-banner>
        )}
        {detail.state.refund && (
          <s-text>Refund due: {detail.state.refund.type === 'full' ? 'full' : 'part'} refund{detail.state.refund.reason ? ` (${detail.state.refund.reason})` : ''}, raised by {detail.state.refund.by.name}.</s-text>
        )}
        <s-select label="Apply to" value={scope} onChange={(e) => setScope(e.currentTarget.value)}>
          <s-option value="order">Whole order</s-option>
          <s-option value="lines">Ticked items</s-option>
        </s-select>
        <s-select label="Status" value={statusId} onChange={(e) => setStatusId(e.currentTarget.value)}>
          <s-option value="">Choose a status</s-option>
          {STATUSES.map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
        </s-select>
        {scope === 'lines' && picked.length === 0 && <s-text>Tick at least one item in the table to save.</s-text>}
        {blocked && <s-text>Payment Process cannot be set on items. Use Whole order.</s-text>}
        {statusId === '7' && (
          <s-banner tone="warning">
            Cancelling here does not refund the customer. Refund in Shopify:{' '}
            <s-link href={`shopify://admin/orders/${orderId.split('/').pop()}`}>open this order</s-link>.
          </s-banner>
        )}
        {statusId === '7' && <s-text-field label="Cancel reason" value={extras.cancelReason} onInput={setExtra('cancelReason')} />}
        {statusId === '21' && <s-text-field label="Credit note amount (£)" value={extras.creditNoteAmount} onInput={setExtra('creditNoteAmount')} />}
        {statusId === '15' && <s-text-area label="Service remarks" rows={2} value={extras.serviceRemarks} onInput={setExtra('serviceRemarks')} />}
        <EmailTick emails={emails} checked={emailIt} onChange={setEmailIt} />
        <s-button variant="primary" disabled={!canSaveNow || undefined} loading={(saving && mine) || undefined} onClick={track(onSave)}>Save status</s-button>
      </s-stack>
    </s-section>
  );
}
