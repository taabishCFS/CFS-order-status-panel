import { useEffect, useState } from 'preact/hooks';
import { applyServicesChange } from '../../cfs-order-status/src/detailState';
import { draftOf, historyChanges, loadServices, requestOf, saveServices } from './services';

// Update Delivery & Services: tick a service and give its price (VAT included) to add it to the Shopify order;
// untick it to take it off. Changes the order total and balance. Recorded in the history.
export default function ServicesSection({ id, writer, verified, reload, setNotice }) {
  const [rows, setRows] = useState(null); // [{ key, label, amountMinor }]
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(false);

  const load = () => loadServices(id).then((r) => {
    if (r.ok) { setRows(r.services); setDrafts({}); setMessage(null); }
    else setMessage({ tone: 'warning', text: `Delivery and services could not be loaded: ${r.message}` });
  });
  useEffect(() => { load(); }, [id]);

  const draftFor = (row) => drafts[row.key] ?? draftOf(row);
  const change = (row, patch) => setDrafts((d) => ({ ...d, [row.key]: { ...draftFor(row), ...patch } }));
  const dirty = rows?.some((r) => drafts[r.key] && (drafts[r.key].on !== (r.amountMinor !== null) || (drafts[r.key].on && drafts[r.key].amount.trim() !== draftOf(r).amount)));

  async function save() {
    const req = requestOf(rows, drafts);
    if (!req.ok) { setMessage({ tone: 'critical', text: req.message }); return; }
    setBusy(true);
    setMessage(null);
    const res = await saveServices(id, req.services);
    if (!res.ok) { setBusy(false); setMessage({ tone: 'critical', text: res.message }); return; }
    if (res.changed) {
      // Shopify has the change. Record it; if that fails the services are still on the order.
      const recorded = await writer.write((state, meta) => applyServicesChange(state, { changes: historyChanges(res.changes), ...meta }));
      if (!recorded) setNotice({ tone: 'warning', text: 'The services were changed on the order, but the history entry was not recorded.' });
      else await reload();
    }
    setBusy(false);
    await load();
    setMessage({ tone: 'success', text: res.changed ? 'Delivery and services updated. The order total and balance now include them.' : 'Nothing to change.' });
  }

  return (
    <s-section heading="Update Delivery & Services">
      <s-stack direction="block" gap="base">
        {!verified && <s-banner tone="warning">Changing delivery and services needs a verified Shopify staff sign-in.</s-banner>}
        {message && <s-banner tone={message.tone} dismissible onDismiss={() => setMessage(null)}>{message.text}</s-banner>}
        {!rows && !message && <s-text>Loading…</s-text>}
        {rows && rows.map((row) => {
          const d = draftFor(row);
          return (
            <s-stack key={row.key} direction="inline" gap="base" alignItems="end">
              <s-box minInlineSize="240px"><s-text>{row.label}</s-text></s-box>
              <s-text-field label={`${row.label} amount (£, VAT included)`} labelAccessibilityVisibility="exclusive" value={d.amount} onInput={(e) => change(row, { amount: e.currentTarget.value })} />
              <s-checkbox label="On the order" checked={d.on} onChange={(e) => change(row, { on: e.currentTarget.checked })} />
            </s-stack>
          );
        })}
        {rows && <s-button variant="primary" disabled={!verified || !dirty || busy || undefined} loading={busy || undefined} onClick={save}>Delivery & services</s-button>}
        <s-text color="subdued">Amounts include VAT. Each ticked service is added to the Shopify order as its own line; unticking removes it. The customer is not emailed.</s-text>
      </s-stack>
    </s-section>
  );
}
