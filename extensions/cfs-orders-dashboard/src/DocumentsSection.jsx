import { useState } from 'preact/hooks';
import { RETURN_TYPES, deliveryNoteStatus, loadNoteLog, requestDocument, resendInvoice } from './documents';

const when = (iso) => new Date(iso).toLocaleString('en-GB');

// The document buttons of the legacy order header: Save PDF, Exc VAT Inv., Inc VAT Inv., Print Delivery Note (with its log),
// Resend Inv., Print Label, Print Ret. Label. Each opens a printable page in a new tab; use the browser's Print or Save as PDF there.
export default function DocumentsSection({ id, detail, lines, picked, verified, email }) {
  const [busy, setBusy] = useState(null);
  const [ready, setReady] = useState(null); // { url, label } the link to open
  const [message, setMessage] = useState(null);
  const [returnType, setReturnType] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendKey] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [sent, setSent] = useState(null);
  const [log, setLog] = useState(null); // null: closed, else { entries } or { error }

  const note = deliveryNoteStatus({ balanceAmount: detail.breakdown.balance?.amount ?? null, state: detail.state, lineIds: lines.map((l) => l.id) });
  const disabled = !verified || undefined;

  async function open(kind, label, extra) {
    setBusy(kind);
    setMessage(null);
    setReady(null);
    const res = await requestDocument(id, kind, extra);
    setBusy(null);
    if (res.ok) setReady({ url: res.url, label });
    else setMessage(res.message);
  }

  async function send() {
    setBusy('resend');
    setMessage(null);
    const res = await resendInvoice(id, sendKey);
    setBusy(null);
    setConfirmSend(false);
    if (res.ok) setSent(`The invoice was queued to ${res.recipient ?? 'the customer'}. See the Email log for whether it was sent.`);
    else setMessage(res.message);
  }

  async function showLog() {
    if (log) { setLog(null); return; }
    const res = await loadNoteLog(id);
    setLog(res.ok ? { entries: res.log } : { error: res.message });
  }

  return (
    <s-section heading="Documents">
      <s-stack direction="block" gap="base">
        {!verified && <s-banner tone="warning">Printing documents needs a verified Shopify staff sign-in.</s-banner>}
        {message && <s-banner tone="critical" dismissible onDismiss={() => setMessage(null)}>{message}</s-banner>}
        {ready && (
          <s-banner tone="success" dismissible onDismiss={() => setReady(null)}>
            {ready.label} is ready (the link works for 5 minutes). <s-link href={ready.url} target="_blank">Open {ready.label}</s-link>, then use Print or Save as PDF.
          </s-banner>
        )}
        <s-stack direction="inline" gap="small" alignItems="start">
          <s-button disabled={disabled} loading={busy === 'invoice' || undefined} onClick={() => open('invoice', 'The invoice')}>Save PDF</s-button>
          <s-button disabled={disabled} loading={busy === 'exc-vat' || undefined} onClick={() => open('exc-vat', 'The invoice (ex VAT)')}>Exc VAT Inv.</s-button>
          <s-button disabled={disabled} loading={busy === 'inc-vat' || undefined} onClick={() => open('inc-vat', 'The tax invoice')}>Inc VAT Inv.</s-button>
          <s-stack direction="block" gap="small-300">
            <s-button disabled={!note.ok || disabled} loading={busy === 'delivery-note' || undefined} onClick={() => open('delivery-note', 'The delivery note')}>Print Delivery Note</s-button>
            <s-link onClick={showLog}>Delv. Notes Log</s-link>
          </s-stack>
          <s-button disabled={disabled || email === null} onClick={() => { setSent(null); setConfirmSend(true); }}>Resend Inv.</s-button>
          <s-button disabled={disabled} loading={busy === 'label' || undefined} onClick={() => open('label', 'The label')}>Print Label</s-button>
        </s-stack>
        {!note.ok && <s-text color="subdued">Delivery note unavailable: {note.reason}</s-text>}
        {confirmSend && (
          <s-banner tone="warning" heading="Email the invoice to the customer?">
            <s-stack direction="block" gap="small">
              <s-text>It will be sent to {email ?? 'the email address on the order'}. This is a temporary email layout until the wording is confirmed.</s-text>
              <s-stack direction="inline" gap="small">
                <s-button variant="primary" loading={busy === 'resend' || undefined} onClick={send}>Send invoice</s-button>
                <s-button onClick={() => setConfirmSend(false)}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </s-banner>
        )}
        {sent && <s-banner tone="success" dismissible onDismiss={() => setSent(null)}>{sent}</s-banner>}
        {email === null && <s-text color="subdued">Resend Inv. needs a customer email on the order.</s-text>}
        <s-stack direction="inline" gap="small" alignItems="end">
          <s-select label="Return label type" value={returnType} onChange={(e) => setReturnType(e.currentTarget.value)}>
            <s-option value="">Select Label Type</s-option>
            {RETURN_TYPES.map((t) => <s-option key={t.value} value={t.value}>{t.label}</s-option>)}
          </s-select>
          <s-button tone="critical" disabled={!returnType || picked.length === 0 || disabled} loading={busy === 'return-label' || undefined} onClick={() => open('return-label', 'The return label', { lineIds: picked, type: returnType })}>Print Ret. Label</s-button>
        </s-stack>
        <s-text color="subdued">The return label lists the items ticked in the Items table, with their quantities.</s-text>
        {log && (
          <s-stack direction="block" gap="small-300">
            <s-text type="strong">Delivery notes log</s-text>
            {log.error && <s-banner tone="warning">{log.error}</s-banner>}
            {log.entries?.length === 0 && <s-text>No delivery note has been printed yet.</s-text>}
            {log.entries?.map((e, i) => <s-text key={i}>{when(e.at)} : {e.by}</s-text>)}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
