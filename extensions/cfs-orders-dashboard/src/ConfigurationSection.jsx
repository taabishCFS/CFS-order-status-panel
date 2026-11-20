import { useEffect, useState } from 'preact/hooks';
import { applyConfigurationChange } from '../../cfs-order-status/src/detailState';
import { verifiedActor } from '../../cfs-order-status/src/identity';
import { callBackendResult } from './backend';
import { canQuote, formatDelta, formatMoney, outcomeText, reasonText, selectionFromConfiguration, selectionToRequest, summarise } from './configuration';

const post = (path, body) =>
  callBackendResult(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const lastId = (gid) => String(gid).split('/').at(-1);

// Change the options of a configured item. The configurator prices the choice and the backend posts
// the price difference to the Shopify order; this page only shows and asks.
export default function ConfigurationSection({ id, currency, writer, verified, reload }) {
  const [data, setData] = useState(null); // { lines, reason } | { error }
  const [editing, setEditing] = useState(null); // line being changed
  const [catalog, setCatalog] = useState(null); // { groups, choices } | { error }
  const [sel, setSel] = useState(null);
  const [quote, setQuote] = useState(null);
  const [reason, setReason] = useState('');
  // Which request is running: 'check' (pricing) or 'apply' (saving). Only that button spins; both stay disabled meanwhile.
  const [working, setWorking] = useState(null);
  const busy = working !== null;
  const [message, setMessage] = useState(null); // { tone, text }

  async function load() {
    try {
      const r = await callBackendResult(`api/orders/${id}/configuration`);
      setData(r.ok ? r.body : { error: r.body?.code ?? r.body?.error ?? `status ${r.status}` });
    } catch (e) {
      setData({ error: e.message });
    }
  }
  useEffect(() => { load(); }, [id]);

  async function startEdit(line) {
    const initial = selectionFromConfiguration(line.configuration);
    setMessage(null);
    setQuote(null);
    setReason('');
    if (!initial) {
      setMessage({ tone: 'warning', text: 'This item has several choices in one group. Change it in the configurator instead.' });
      return;
    }
    setEditing(line);
    setSel(initial);
    setCatalog(null);
    try {
      const r = await callBackendResult(`api/lines/choices?product=${lastId(line.productId)}`);
      setCatalog(r.ok ? r.body : { error: r.body?.code ?? r.body?.error ?? `status ${r.status}` });
    } catch (e) {
      setCatalog({ error: e.message });
    }
  }

  const stop = () => { setEditing(null); setSel(null); setQuote(null); setCatalog(null); };
  const change = (next) => { setSel(next); setQuote(null); setMessage(null); };
  const groupNames = catalog?.groups?.map((g) => g.name) ?? [];
  const body = () => ({ orderId: id, lineItemId: editing.lineItemId, ...selectionToRequest(sel, groupNames) });

  async function check() {
    setWorking('check');
    setMessage(null);
    try {
      const r = await post('api/lines/quote', body());
      if (r.ok) setQuote(r.body);
      else setMessage({ tone: 'warning', text: outcomeText(r.body?.outcome ?? 'failed', r.body?.message ?? r.body?.code) });
    } catch (e) {
      setMessage({ tone: 'critical', text: `Could not price this change: ${e.message}` });
    }
    setWorking(null);
  }

  async function apply() {
    setWorking('apply');
    setMessage(null);
    let result;
    try {
      const r = await post('api/lines/configuration', { ...body(), expectedVersion: editing.version, reason });
      result = r.body && r.body.outcome ? r.body : { outcome: 'failed', message: r.body?.error ?? `status ${r.status}` };
    } catch (e) {
      result = { outcome: 'failed', message: e.message };
    }
    if (result.outcome !== 'applied') {
      setMessage({ tone: result.outcome === 'failed' ? 'critical' : 'warning', text: outcomeText(result.outcome, result.message) });
      setWorking(null);
      return;
    }

    // The change is made. Add it to the order's history; if that fails the version record still has it.
    const from = summarise(editing.configuration);
    const to = summarise({ baseCents: 0, unitCents: 0, options: quote.options });
    const note = `Price difference ${formatDelta(result.deltaMinor, currency)}. Reason: ${reason.trim()}`;
    // The backend verified who made the change, so the history uses that identity (no typed name needed).
    const logged = await writer.write(
      (state, meta) => applyConfigurationChange(state, { ...meta, lineId: editing.lineItemId, from, to, note }),
      verifiedActor(verified),
    );
    stop();
    setReason('');
    setMessage({
      tone: logged ? 'success' : 'warning',
      text: logged ? 'Change applied and added to the history.' : 'Change applied, but it could not be added to the history. The version record below has it.',
    });
    await load();
    await reload();
    setWorking(null);
  }

  if (!data) return <s-section heading="Configuration"><s-text>Loading…</s-text></s-section>;
  if (data.error) return <s-section heading="Configuration"><s-banner tone="warning">Configuration is unavailable right now ({data.error}).</s-banner></s-section>;
  if (data.reason) return <s-section heading="Configuration"><s-text>{reasonText(data.reason)}</s-text></s-section>;
  if (data.lines.every((l) => !l.configuration)) return null;

  const ready = writer.ready && Boolean(verified) && !busy;

  return (
    <s-section heading="Configuration">
      <s-stack direction="block" gap="base">
        {!verified && <s-banner tone="warning">Changing options needs a verified Shopify staff sign-in.</s-banner>}
        {message && <s-banner tone={message.tone}>{message.text}</s-banner>}
        {data.lines.filter((l) => l.configuration).map((l) => (
          <s-box key={l.lineItemId} padding="small" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">{l.title}{l.variantTitle ? ` (${l.variantTitle})` : ''} · quantity {l.quantity}</s-text>
              <s-text>Current options (version {l.version}): {summarise(l.configuration)}</s-text>
              {l.editable
                ? !editing && <s-button disabled={!ready || undefined} onClick={() => startEdit(l)}>Change options</s-button>
                : <s-text>{reasonText(l.reason)}</s-text>}

              {editing?.lineItemId === l.lineItemId && (
                <s-stack direction="block" gap="small">
                  {!catalog && <s-text>Loading choices…</s-text>}
                  {catalog?.error && <s-banner tone="warning">Choices could not be loaded ({catalog.error}).</s-banner>}
                  {catalog?.groups?.map((g) => {
                    const options = catalog.choices.filter((c) => c.group === g.name);
                    const picked = options.find((c) => c.id === sel.picks[g.name]);
                    return (
                      <s-stack key={g.name} direction="inline" gap="small" alignItems="end">
                        <s-select
                          label={g.optional ? `${g.name} (optional)` : g.name}
                          value={sel.picks[g.name] ?? ''}
                          onChange={(e) => change({ ...sel, picks: { ...sel.picks, [g.name]: e.currentTarget.value } })}
                        >
                          <s-option value="">{g.optional ? 'None' : 'Choose…'}</s-option>
                          {options.map((c) => <s-option key={c.id} value={c.id}>{c.label}</s-option>)}
                        </s-select>
                        {picked?.kind === 'accessory' && (
                          <s-number-field
                            label="Quantity"
                            min={1}
                            max={catalog.accessoryMax ?? undefined}
                            value={String(sel.quantities[picked.id] ?? 1)}
                            onInput={(e) => change({ ...sel, quantities: { ...sel.quantities, [picked.id]: Number(e.currentTarget.value) || 1 } })}
                          />
                        )}
                      </s-stack>
                    );
                  })}

                  {catalog?.groups && (
                    <>
                      <s-button disabled={!ready || !canQuote(sel, catalog.groups) || undefined} loading={working === 'check' || undefined} onClick={check}>Check price</s-button>
                      {quote && (
                        <s-stack direction="block" gap="small-300">
                          <s-text>
                            New unit price {formatMoney(quote.newUnitMinor, currency)} (was {formatMoney(quote.currentUnitMinor, currency)}).
                            Difference for {l.quantity} {l.quantity === 1 ? 'item' : 'items'}: {formatDelta(quote.deltaMinor, currency)}.
                          </s-text>
                          {quote.same && <s-text>These are already the current options.</s-text>}
                        </s-stack>
                      )}
                      <s-text-field label="Reason for the change (kept in the history)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
                    </>
                  )}
                  <s-stack direction="inline" gap="small">
                    <s-button variant="primary" disabled={!ready || !quote || quote.same || !reason.trim() || undefined} loading={working === 'apply' || undefined} onClick={apply}>Apply change</s-button>
                    <s-button disabled={busy || undefined} onClick={stop}>Cancel</s-button>
                  </s-stack>
                </s-stack>
              )}

              {l.history.length > 1 && (
                <s-stack direction="block" gap="small-300">
                  <s-text type="strong">Versions</s-text>
                  {[...l.history].reverse().map((h) => (
                    <s-text key={h.version}>
                      v{h.version} · {h.source === 'original' ? 'Original order' : `${h.actorName ?? 'Staff'} · ${h.status} · ${formatDelta(h.deltaMinor, currency)}`}
                      {h.reason ? ` · ${h.reason}` : ''} · {summarise(h.configuration)}
                    </s-text>
                  ))}
                </s-stack>
              )}
            </s-stack>
          </s-box>
        ))}
      </s-stack>
    </s-section>
  );
}
