import { useState } from 'preact/hooks';
import { useStaff } from './useStaff';
import { callProcess, processOrder } from './supplierChase';

// Process Order: emails the supplier order form and sets the lines to Order in Progress.
// Shows what will happen first (a preview that sends nothing), then sends when staff confirm.
// Give it `lineIds` (ticked lines) or `orderIds` (whole orders). `onDone` runs after a send so the page can reload.
export default function ProcessOrderButton({ lineIds, orderIds, disabled, onDone, label = 'Process Order' }) {
  const staff = useStaff();
  const [busy, setBusy] = useState(null); // 'preview' | 'send'
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null); // { tone, text }

  async function ask() {
    setBusy('preview');
    setResult(null);
    const res = await callProcess({ action: 'order', lineIds: orderIds ? undefined : lineIds, orderIds, key: 'preview', dryRun: true });
    setBusy(null);
    if (!res.ok) { setResult({ tone: 'critical', text: res.message }); return; }
    setPreview(res.data);
  }

  async function send() {
    setBusy('send');
    const res = await processOrder({ lineIds: orderIds ? undefined : lineIds, orderIds, actor: staff, key: crypto.randomUUID() });
    setBusy(null);
    setPreview(null);
    setResult(res.ok ? { tone: res.tone, text: res.text } : { tone: 'critical', text: res.message });
    if (res.ok && onDone) await onDone();
  }

  const nothing = preview && preview.processedLines.length === 0;
  return (
    <>
      <s-button disabled={disabled || !staff || busy !== null || undefined} loading={busy === 'preview' || undefined} onClick={ask}>{label}</s-button>
      {preview && (
        <s-banner tone={nothing ? 'warning' : 'info'} heading={nothing ? 'Nothing to process' : 'Process these orders?'} dismissible onDismiss={() => setPreview(null)}>
          <s-paragraph>
            {preview.emails} order form{preview.emails === 1 ? '' : 's'} will be emailed to suppliers
            {preview.handOrdered > 0 ? `, ${preview.handOrdered} line${preview.handOrdered === 1 ? '' : 's'} are for brands ordered by hand (no email)` : ''}.
            The lines then move to Order in Progress.
          </s-paragraph>
          {preview.noSupplier.length > 0 && <s-paragraph>No email will be sent for {preview.noSupplier.join(', ')}: add the supplier email on the Suppliers page.</s-paragraph>}
          {preview.skipped > 0 && <s-paragraph>{preview.skipped} line{preview.skipped === 1 ? '' : 's'} skipped because their status cannot be ordered.</s-paragraph>}
          {!nothing && <s-button slot="primary-action" loading={busy === 'send' || undefined} onClick={send}>Send and set Order in Progress</s-button>}
          <s-button slot="secondary-actions" onClick={() => setPreview(null)}>Cancel</s-button>
        </s-banner>
      )}
      {result && <s-banner tone={result.tone} dismissible onDismiss={() => setResult(null)}>{result.text}</s-banner>}
    </>
  );
}
