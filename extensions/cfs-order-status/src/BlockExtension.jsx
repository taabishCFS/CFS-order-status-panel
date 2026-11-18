import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { selfDeclaredActor } from './identity';
import { applyChange, emptyState, reconcileLines } from './state';
import { STATUSES, labelFor, statusById } from './statuses';
import { loadState, saveState } from './store';

export default async () => {
  render(<Extension />, document.body);
};

const LINES_QUERY = `#graphql
  query CfsOrderLines($id: ID!) {
    order(id: $id) {
      lineItems(first: 100) { nodes { id title variantTitle quantity } }
    }
  }`;

async function loadLines(orderId) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({ query: LINES_QUERY, variables: { id: orderId } }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data.order.lineItems.nodes;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const when = (iso) => new Date(iso).toLocaleString('en-GB');

function Extension() {
  const orderId = shopify.data.selected[0].id;
  const [lines, setLines] = useState([]);
  const [state, setState] = useState(emptyState());
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text, refresh? }
  const [scope, setScope] = useState('order');
  const [picked, setPicked] = useState([]);
  const [statusId, setStatusId] = useState('');
  const [name, setName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ state: s, digest: d }, ls] = await Promise.all([loadState(orderId), loadLines(orderId)]);
      setState(s);
      setDigest(d);
      setLines(ls);
      setNotice(null);
    } catch (e) {
      setNotice({ tone: 'critical', text: e.message });
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const lineIds = lines.map((l) => l.id);
  const { removed } = reconcileLines(state, lineIds);
  const lineTitle = (id) => lines.find((l) => l.id === id)?.title ?? 'Removed line';
  const canSave = !saving && statusId !== '' && (scope === 'order' || picked.length > 0);

  async function onSave() {
    setNotice(null);
    let actor;
    try {
      actor = selfDeclaredActor(name);
    } catch (e) {
      setNotice({ tone: 'warning', text: e.message });
      return;
    }
    setSaving(true);
    const next = applyChange(state, {
      scope,
      lineIds: picked,
      status: statusById(Number(statusId)),
      actor,
      now: new Date().toISOString(),
      entryId: newId(),
    });
    const result = await saveState(orderId, next, digest);
    if (result.ok) {
      setStatusId('');
      setPicked([]);
      await refresh();
    } else if (result.reason === 'stale') {
      setNotice({ tone: 'warning', text: 'Someone else changed this order’s status. Refresh to see the latest before saving again.', refresh: true });
    } else {
      setNotice({ tone: 'critical', text: `Not saved: ${result.message}` });
    }
    setSaving(false);
  }

  const toggle = (id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));

  return (
    <s-admin-block heading="CFS Order Status">
      <s-stack direction="block" gap="base">
        {notice && (
          <s-banner tone={notice.tone}>
            {notice.text}
            {notice.refresh && <s-button slot="secondary-actions" onClick={refresh}>Refresh</s-button>}
          </s-banner>
        )}
        {loading ? <s-text>Loading…</s-text> : (
          <>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text type="strong">Order status:</s-text>
              <s-badge>{state.order ? labelFor(state.order.statusId) : 'Not set'}</s-badge>
            </s-stack>

            <s-stack direction="block" gap="small">
              <s-text type="strong">Items</s-text>
              {lines.map((l) => (
                <s-stack key={l.id} direction="inline" gap="small" alignItems="center">
                  {scope === 'lines' && (
                    <s-checkbox label="" checked={picked.includes(l.id)} onChange={(e) => toggle(l.id, e.currentTarget.checked)} />
                  )}
                  <s-text>{l.title}{l.variantTitle ? ` (${l.variantTitle})` : ''} × {l.quantity}</s-text>
                  <s-badge>{state.lines[l.id] ? labelFor(state.lines[l.id].statusId) : 'Not set'}</s-badge>
                </s-stack>
              ))}
              {removed.map((id) => (
                <s-stack key={id} direction="inline" gap="small" alignItems="center">
                  <s-text>Removed from order</s-text>
                  <s-badge>{labelFor(state.lines[id].statusId)}</s-badge>
                </s-stack>
              ))}
            </s-stack>

            <s-divider />
            <s-select label="Apply to" value={scope} onChange={(e) => setScope(e.currentTarget.value)}>
              <s-option value="order">Whole order</s-option>
              <s-option value="lines">Selected items</s-option>
            </s-select>
            <s-select label="Status" value={statusId} onChange={(e) => setStatusId(e.currentTarget.value)}>
              <s-option value="">Choose a status</s-option>
              {STATUSES.map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
            </s-select>
            <s-text-field label="Your name" value={name} onInput={(e) => setName(e.currentTarget.value)} />
            <s-button variant="primary" disabled={!canSave} loading={saving} onClick={onSave}>Save</s-button>

            <s-divider />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Status history</s-text>
              {state.history.length === 0 && <s-text>No status changes yet.</s-text>}
              {[...state.history].reverse().map((h) => (
                <s-box key={h.id} padding="small" border="base" borderRadius="base">
                  <s-text>{when(h.at)} · {h.by.name} · {h.scope === 'order' ? 'Whole order' : 'Selected items'}</s-text>
                  {h.changes.map((c) => (
                    <s-text key={c.target}>
                      {c.target === 'order' ? 'Order' : lineTitle(c.target)}: {c.fromId == null ? 'Not set' : labelFor(c.fromId)} → {c.toLabel}
                    </s-text>
                  ))}
                </s-box>
              ))}
            </s-stack>
          </>
        )}
      </s-stack>
    </s-admin-block>
  );
}
