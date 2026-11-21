import { useEffect, useState } from 'preact/hooks';
import { applyRefundRequest } from '../../cfs-order-status/src/detailState';
import { REASON_OPTIONS, addRefund, loadRefunds, moneyText, refundSummary } from './refunds';

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const blank = () => ({ clientKey: newKey(), reason: '', type: '', amount: '', lineIds: [], notes: '' });
const when = (iso) => new Date(iso).toLocaleString('en-GB');

// Payment & Refund: tick REFUND to ask for a refund. The request goes on a list for accounts; no money moves here.
export default function RefundSection({ id, detail, writer, verified, setNotice }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [list, setList] = useState(null); // { requests, refundableMinor }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = () => loadRefunds(id).then((r) => {
    if (r.ok) setList(r);
    else setError(`Refund requests could not be loaded: ${r.message}`);
  });
  useEffect(() => { reload(); }, [id]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.currentTarget.value }));
  const toggleLine = (lineId, on) => setForm((f) => ({ ...f, lineIds: on ? [...f.lineIds, lineId] : f.lineIds.filter((x) => x !== lineId) }));
  const titleOf = (lineId) => detail.lines.find((l) => l.id === lineId)?.title ?? 'Removed line';

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await addRefund(id, form);
    if (!res.ok) { setBusy(false); setError(res.message); return; }
    const r = res.request;
    // The request is saved. Record it in the history; if that fails the request still stands.
    const recorded = await writer.write((state, meta) => applyRefundRequest(state, { summary: refundSummary(r.type, r.amountMinor, r.reason), notes: form.notes, ...meta }));
    setBusy(false);
    setOpen(false);
    setForm(blank());
    if (!recorded) setNotice({ tone: 'warning', text: 'The refund request was saved, but the history entry was not recorded.' });
    await reload();
  }

  const ready = form.reason && form.type && !busy && verified;

  return (
    <s-section heading="Payment & Refund">
      <s-stack direction="block" gap="base">
        {list && <s-text>Still refundable on this order: £{moneyText(list.refundableMinor)}</s-text>}
        <s-checkbox label="REFUND" checked={open} onChange={(e) => { setOpen(e.currentTarget.checked); setError(null); }} />
        {!verified && <s-text color="subdued">Adding a refund needs a verified Shopify staff sign-in.</s-text>}
        {error && <s-banner tone="critical" dismissible onDismiss={() => setError(null)}>{error}</s-banner>}
        {open && (
          <s-stack direction="block" gap="base">
            <s-select label="Reason" value={form.reason} onChange={set('reason')}>
              <s-option value="">Select Reason</s-option>
              {REASON_OPTIONS.map((r) => <s-option key={r.code} value={r.code}>{r.label}</s-option>)}
            </s-select>
            <s-stack direction="block" gap="small-300">
              <s-text type="strong">Product(s)</s-text>
              {detail.lines.map((l) => (
                <s-checkbox key={l.id} label={l.title} checked={form.lineIds.includes(l.id)} onChange={(e) => toggleLine(l.id, e.currentTarget.checked)} />
              ))}
            </s-stack>
            <s-select label="Refund type" value={form.type} onChange={set('type')}>
              <s-option value="">Select Refund Type</s-option>
              <s-option value="part">Part Refund</s-option>
              <s-option value="full">Full Refund</s-option>
            </s-select>
            <s-text-field label="Amount (£)" value={form.amount} onInput={set('amount')} details={form.type === 'full' ? 'Leave blank to refund everything still refundable.' : undefined} />
            <s-text-area label="Reason notes" rows={3} value={form.notes} onInput={set('notes')} />
            <s-button variant="primary" disabled={!ready || undefined} loading={busy || undefined} onClick={submit}>Add refund</s-button>
          </s-stack>
        )}
        {list && list.requests.length > 0 && (
          <s-stack direction="block" gap="small">
            <s-text type="strong">Refund requests</s-text>
            {list.requests.map((r) => (
              <s-box key={r.id} padding="small" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-300">
                  <s-text>{refundSummary(r.type, r.amountMinor, r.reason)}</s-text>
                  {r.lineIds.length > 0 && <s-text color="subdued">Products: {r.lineIds.map(titleOf).join(', ')}</s-text>}
                  {r.notes && <s-text color="subdued">{r.notes}</s-text>}
                  <s-text color="subdued">{r.status} · requested by {r.createdByName ?? 'staff'} on {when(r.createdAt)}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
