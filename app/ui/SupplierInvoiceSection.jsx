import { useEffect, useState } from 'react';
import { draftOf, isSameDraft, loadSupplierInvoices, saveSupplierInvoice } from './supplierInvoice';

const when = (iso) => new Date(iso).toLocaleString('en-GB');

// Supplier invoice details per line (date, number, amount, paid). Collapsed by default, like the legacy screen.
export default function SupplierInvoiceSection({ id, lines, currency, verified }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(null); // { lineId: SavedInvoice } once loaded
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null); // line id being saved
  const [message, setMessage] = useState(null); // { tone, text }

  useEffect(() => {
    if (!open || saved) return;
    loadSupplierInvoices(id).then((r) => {
      if (r.ok) setSaved(r.invoices);
      else setMessage({ tone: 'warning', text: `Supplier invoice details could not be loaded: ${r.message}` });
    });
  }, [open]);

  const draftFor = (lineId) => drafts[lineId] ?? draftOf(saved?.[lineId]);
  const change = (lineId, patch) => setDrafts((d) => ({ ...d, [lineId]: { ...draftFor(lineId), ...patch } }));

  async function save(line) {
    setBusy(line.id);
    setMessage(null);
    const res = await saveSupplierInvoice(id, line.id, draftFor(line.id));
    setBusy(null);
    if (!res.ok) { setMessage({ tone: 'critical', text: res.message }); return; }
    setSaved((s) => {
      const next = { ...(s ?? {}) };
      if (res.invoice) next[line.id] = res.invoice;
      else delete next[line.id];
      return next;
    });
    setDrafts((d) => { const { [line.id]: _gone, ...rest } = d; return rest; });
    setMessage({ tone: 'success', text: `Saved for ${line.title}.` });
  }

  return (
    <s-section heading="Supplier Invoice Update">
      <s-stack direction="block" gap="base">
        <s-button onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'}</s-button>
        {open && !verified && <s-banner tone="warning">Saving supplier invoice details needs a verified Shopify staff sign-in.</s-banner>}
        {open && message && <s-banner tone={message.tone} dismissible onDismiss={() => setMessage(null)}>{message.text}</s-banner>}
        {open && !saved && !message && <s-text>Loading…</s-text>}
        {open && saved && lines.map((line) => {
          const draft = draftFor(line.id);
          const record = saved[line.id];
          const unchanged = isSameDraft(draft, draftOf(record));
          return (
            <s-box key={line.id} padding="small" border="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text type="strong">{line.title}{line.variantTitle ? ` (${line.variantTitle})` : ''}</s-text>
                <s-stack direction="inline" gap="base" alignItems="end">
                  <s-date-field label="Invoice date" value={draft.invoiceDate} onChange={(e) => change(line.id, { invoiceDate: e.currentTarget.value })} />
                  <s-text-field label="Invoice number" value={draft.invoiceNumber} onInput={(e) => change(line.id, { invoiceNumber: e.currentTarget.value })} />
                  <s-text-field label={`Amount (${currency})`} value={draft.amount} onInput={(e) => change(line.id, { amount: e.currentTarget.value })} />
                  <s-checkbox label="Paid" checked={draft.paid} onChange={(e) => change(line.id, { paid: e.currentTarget.checked })} />
                  <s-button variant="primary" disabled={!verified || unchanged || busy !== null || undefined} loading={busy === line.id || undefined} onClick={() => save(line)}>Save</s-button>
                </s-stack>
                {record && <s-text color="subdued">Last saved by {record.updatedByName ?? 'staff'} on {when(record.updatedAt)}</s-text>}
              </s-stack>
            </s-box>
          );
        })}
      </s-stack>
    </s-section>
  );
}
