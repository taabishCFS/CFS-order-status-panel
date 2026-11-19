import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { loadOlderHistory } from './archive';
import { fetchStaffActor, resolveActor } from './identity';
import { canSave as canSaveNow } from './canSave';
import { commitChange } from './save';
import { describeEntry, scopeLabel } from './historyText';
import { applyChange } from './state';
import { STATUSES, labelFor, statusById } from './statuses';
import { syncStatusTag } from './tags';
import { lineText, useOrderStatus } from './useOrderStatus';

export default async () => {
  render(<Extension />, document.body);
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const when = (iso) => new Date(iso).toLocaleString('en-GB');

function Extension() {
  const orderId = shopify.data.selected[0].id;
  const { lines, state, digest, loading, loadFailed, notice, setNotice, refresh, removed, removedInfo } = useOrderStatus(orderId);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState('order');
  const [picked, setPicked] = useState([]);
  const [statusId, setStatusId] = useState('');
  const [name, setName] = useState('');
  // undefined while checking, null when Shopify will not say who is signed in
  const [staff, setStaff] = useState(undefined);
  const [older, setOlder] = useState({ entries: [], cursor: null, hasNext: true, loading: false });

  useEffect(() => { fetchStaffActor().then(setStaff); }, []);

  // Refreshing moves the latest-20 window, so any older entries already loaded are out of date.
  const refreshAll = () => {
    setOlder({ entries: [], cursor: null, hasNext: true, loading: false });
    return refresh();
  };

  const total = state.totalEntries ?? state.history.length;
  const shownIds = new Set([...state.history, ...older.entries].map((h) => h.id));
  const canShowOlder = total > state.history.length && older.hasNext;

  async function showOlder() {
    setOlder((o) => ({ ...o, loading: true }));
    try {
      const page = await loadOlderHistory(orderId, { after: older.cursor });
      setOlder((o) => ({
        entries: [...o.entries, ...page.entries.filter((e) => !shownIds.has(e.id))],
        cursor: page.endCursor,
        hasNext: page.hasNextPage,
        loading: false,
      }));
    } catch (e) {
      setOlder((o) => ({ ...o, loading: false }));
      setNotice({ tone: 'warning', text: `Older history could not be loaded: ${e.message}` });
    }
  }

  const lineTitle = (id) => {
    const l = lines.find((x) => x.id === id);
    const r = l || removedInfo[id];
    return r ? `${r.title}${r.variantTitle ? ` (${r.variantTitle})` : ''}${l ? '' : ' (removed from order)'}` : 'Removed line';
  };
  const canSave = staff !== undefined && canSaveNow({ saving, loading, loadFailed, statusId, scope, pickedCount: picked.length });
  const toggle = (id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));

  async function onSave() {
    setNotice(null);
    let actor;
    try {
      actor = resolveActor(staff ?? null, name);
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
    const result = await commitChange(orderId, state, next, digest);
    if (result.ok) {
      const savedScope = scope;
      const savedLabel = statusById(Number(statusId)).label;
      setStatusId('');
      setPicked([]);
      setOlder({ entries: [], cursor: null, hasNext: true, loading: false });
      const tag = savedScope === 'order' ? await syncStatusTag(orderId, savedLabel) : { ok: true };
      await refresh();
      if (!tag.ok) setNotice({ tone: 'warning', text: `Status saved, but the order tag for the Orders list could not be updated: ${tag.message}` });
    } else if (result.reason === 'stale') {
      setNotice({ tone: 'warning', text: 'Someone else changed this order’s status. Refresh to see the latest before saving again.', refresh: true });
    } else {
      setNotice({ tone: 'critical', text: `Not saved: ${result.message}` });
    }
    setSaving(false);
  }

  return (
    <s-admin-action heading="CFS Order Status">
      <s-stack direction="block" gap="base">
        {notice && (
          <s-banner tone={notice.tone}>
            {notice.text}
            {notice.refresh && <s-button slot="secondary-actions" onClick={refreshAll}>Refresh</s-button>}
          </s-banner>
        )}
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text type="strong">Order status:</s-text>
          <s-badge>{state.order ? labelFor(state.order.statusId) : 'Not set'}</s-badge>
        </s-stack>

        <s-select label="Apply to" value={scope} onChange={(e) => setScope(e.currentTarget.value)}>
          <s-option value="order">Whole order</s-option>
          <s-option value="lines">Selected items</s-option>
        </s-select>
        {scope === 'lines' && (
          <s-stack direction="block" gap="small">
            {lines.map((l) => (
              <s-stack key={l.id} direction="inline" gap="small" alignItems="center">
                <s-checkbox label={lineText(l)} checked={picked.includes(l.id)} onChange={(e) => toggle(l.id, e.currentTarget.checked)} />
                <s-badge>{state.lines[l.id] ? labelFor(state.lines[l.id].statusId) : 'Not set'}</s-badge>
              </s-stack>
            ))}
          </s-stack>
        )}
        {scope === 'lines' && picked.length === 0 && <s-text>Tick at least one item to save.</s-text>}
        {scope === 'lines' && removed.length > 0 && (
          <s-text>Removed from order: {removed.map((id) => `${lineTitle(id)} - ${labelFor(state.lines[id].statusId)}`).join('; ')}</s-text>
        )}
        <s-select label="Status" value={statusId} onChange={(e) => setStatusId(e.currentTarget.value)}>
          <s-option value="">Choose a status</s-option>
          {STATUSES.map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
        </s-select>
        {staff
          ? <s-text>Saving as {staff.name}</s-text>
          : staff === null && <s-text-field label="Your name" value={name} onInput={(e) => setName(e.currentTarget.value)} />}

        <s-divider />
        <s-text type="strong">Status history ({total})</s-text>
        {state.history.length === 0 && <s-text>No status changes yet.</s-text>}
        {[...[...state.history].reverse(), ...older.entries].map((h) => (
          <s-box key={h.id} padding="small" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-300">
              <s-text type="strong">{when(h.at)} · {h.by.name}{h.by.source === 'self-declared' ? ' (unverified)' : ''} · {scopeLabel(h.scope)}</s-text>
              {describeEntry(h, lineTitle).map((text, i) => <s-text key={i}>{text}</s-text>)}
            </s-stack>
          </s-box>
        ))}
        {canShowOlder && <s-button loading={older.loading} onClick={showOlder}>Show older history</s-button>}
      </s-stack>
      <s-button slot="primary-action" variant="primary" disabled={!canSave} loading={saving} onClick={onSave}>Save</s-button>
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>Close</s-button>
    </s-admin-action>
  );
}
