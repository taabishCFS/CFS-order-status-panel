import { useCallback, useEffect, useState } from 'preact/hooks';
import { fetchStaffActor } from '../../cfs-order-status/src/identity';
import Pager from './Pager.jsx';
import { formatDate, formatMoney, gatewayLabel, rangeText } from './orderList';
import { claimOptions, exportChoice, loadRefundExportLink, loadRefundList, recordRefunded, refundAction, refundedText, sortLink, titleFor } from './refundList';
import { REASON_OPTIONS, reasonLabel } from './refunds';

const EMPTY_ADD = { reason: '', type: '', orderName: '', amount: '', transactionId: '', notes: '' };
const numericId = (gid) => gid.split('/').pop();
const ucfirst = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const COLUMNS = [
  ['added', 'Added On'], ['order', 'Order No'], [null, 'RefundType'], [null, 'Pay By'], ['reason', 'Reason'], ['notes', 'Notes'],
  [null, 'Paid Amount'], ['amount', 'Refund Amount'], ['refunded', 'Refunded ?'], [null, 'Claimable..?'],
];

// Accounts refund list (legacy Refundable Orders). Pending requests wait here until accounts refund in the payment
// provider and save its transaction ID. No money moves in this app.
export default function RefundsPage() {
  const [applied, setApplied] = useState({ page: 1, all: false, from: '', to: '', q: '', view: null, sort: null, dir: 'desc' });
  const [draft, setDraft] = useState({ from: '', to: '', q: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // { tone, text, link? }
  const [picked, setPicked] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState(EMPTY_ADD);
  const [txn, setTxn] = useState({});
  const [busy, setBusy] = useState(null);
  const [staff, setStaff] = useState(undefined); // undefined while checking, null when Shopify will not say who is signed in

  useEffect(() => { fetchStaffActor().then(setStaff); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadRefundList(applied);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
    setPicked(new Set());
    setConfirming(false);
    setLoading(false);
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const view = data?.view ?? 'pending';
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const verified = !!staff;
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));
  const goPage = (page) => setApplied((a) => ({ ...a, page, all: false }));

  // Legacy: PENDING and REFUNDED start a fresh list; GO keeps the chosen view; searching an order number drops the other filters.
  const showView = (v) => { setDraft({ from: '', to: '', q: '' }); setApplied({ page: 1, all: false, from: '', to: '', q: '', view: v, sort: null, dir: 'desc' }); };
  const goDates = () => setApplied((a) => ({ ...a, page: 1, all: false, from: draft.from, to: draft.to }));
  const search = (q) => setApplied({ page: 1, all: false, from: '', to: '', q: q.trim(), view: null, sort: null, dir: 'desc' });
  const sortBy = (key) => setApplied((a) => ({ ...a, page: 1, all: false, ...sortLink(a, key) }));

  // Runs one change, then reloads. A refund with a transaction ID also goes in the order's history.
  async function run(id, body, done, history) {
    setBusy(id);
    setNotice(null);
    const res = await refundAction(body);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); setBusy(null); return false; }
    let text = done(res.body);
    let tone = 'success';
    if (history) {
      const rec = await recordRefunded(history(res.body), staff);
      if (!rec.ok) { tone = 'warning'; text += ` The history entry on the order was not recorded: ${rec.message}`; }
    }
    setNotice({ tone, text });
    await load();
    setBusy(null);
    return true;
  }

  const saveTransaction = (r) =>
    run(r.id, { action: 'markRefunded', id: r.id, transactionId: txn[r.id] ?? '' }, () => `${r.orderName} marked as refunded.`, (b) => b.request);

  const changeClaimable = (r, value) => run(r.id, { action: 'claimable', id: r.id, value }, () => 'Claimable choice saved.');

  async function confirmRemove() {
    setConfirming(false);
    await run('remove', { action: 'remove', ids: [...picked] }, (b) => `${b.count} record${b.count === 1 ? '' : 's'} removed from the list.`);
  }

  async function submitAdd() {
    const ok = await run('add', { action: 'add', clientKey: crypto.randomUUID(), orderName: add.orderName, reason: add.reason, type: add.type, amount: add.amount, notes: add.notes, transactionId: add.transactionId },
      () => 'Order added to the refund list.',
      add.transactionId.trim() ? (b) => b.request : undefined);
    if (ok) { setAdd(EMPTY_ADD); setAdding(false); }
  }

  async function exportCsv() {
    const choice = exportChoice({ from: draft.from, to: draft.to, view: applied.view }, [...picked]);
    if ('message' in choice) { setNotice({ tone: 'warning', text: choice.message }); return; }
    setBusy('export');
    const res = await loadRefundExportLink(choice.kind === 'filtered' ? { kind: 'filtered', filters: { ...applied, from: draft.from, to: draft.to } } : choice);
    setBusy(null);
    setNotice(res.ok ? { tone: 'success', text: 'Your export is ready (the link works for 5 minutes).', link: res.data } : { tone: 'critical', text: res.message });
  }

  async function exportByDate() {
    if (!draft.from || !draft.to) { setNotice({ tone: 'warning', text: 'Select Start & End Date.' }); return; }
    setBusy('export');
    const res = await loadRefundExportLink({ kind: 'xero', from: draft.from, to: draft.to });
    setBusy(null);
    setNotice(res.ok ? { tone: 'success', text: 'The refund list for Xero is ready (refunds dated in that range; the link works for 5 minutes).', link: res.data } : { tone: 'critical', text: res.message });
  }

  return (
    <s-page heading="Refundable Orders">
      <s-button slot="secondary-actions" href="/">Orders</s-button>
      <s-button slot="secondary-actions" href="/orders-by-brand">Orders by Brand</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>

      {error && <s-banner tone="critical" heading="Could not load the refund list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing the refund list needs a verified Shopify staff sign-in.</s-banner>}
      {data?.capped && <s-banner tone="warning">Showing the newest 2,000 of {data.total} records. Narrow the filters to see the rest.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.link && <s-link href={notice.link.url} target="_blank">Download {notice.link.filename}</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-date-field label="Date from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
          <s-date-field label="Date to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
          <s-button variant="primary" onClick={goDates}>GO</s-button>
          <s-button onClick={exportByDate} loading={busy === 'export' || undefined}>Export Refund By Date</s-button>
          <s-button tone="critical" variant={applied.view === 'pending' ? 'primary' : 'secondary'} onClick={() => showView('pending')}>PENDING</s-button>
          <s-button variant={applied.view === 'refunded' ? 'primary' : 'secondary'} onClick={() => showView('refunded')}>REFUNDED</s-button>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-text>{data ? (data.total > 0 ? rangeText(data.page, 50, data.total, applied.all) : titleFor(view)) : 'Loading...'}</s-text>
          {data && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={goPage} onAll={view === 'refunded' ? undefined : () => setApplied((a) => ({ ...a, all: true, page: 1 }))} />}
          <s-search-field label="Search" placeholder="Search order no" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onChange={(e) => search(e.currentTarget.value)} />
        </s-stack>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button onClick={exportCsv} loading={busy === 'export' || undefined}>Export CSV ({picked.size} ticked)</s-button>
          <s-button tone="critical" disabled={picked.size === 0 || !verified || undefined} onClick={() => setConfirming(true)}>Remove selected ({picked.size})</s-button>
          <s-button variant="primary" disabled={!verified || undefined} onClick={() => setAdding(!adding)}>Add Order</s-button>
        </s-stack>
        {confirming && (
          <s-banner tone="warning" heading={`Remove ${picked.size} record${picked.size === 1 ? '' : 's'}?`}>
            They leave this list. The record is kept, marked as removed with your name.
            <s-button slot="primary-action" onClick={confirmRemove}>Remove</s-button>
            <s-button slot="secondary-actions" onClick={() => setConfirming(false)}>Cancel</s-button>
          </s-banner>
        )}
      </s-section>

      {adding && (
        <s-section heading="Add Refund Order">
          <s-stack direction="block" gap="base">
            <s-select label="Reason" value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.currentTarget.value })}>
              <s-option value="">Select Reason</s-option>
              {REASON_OPTIONS.map((r) => <s-option key={r.code} value={r.code}>{r.label}</s-option>)}
            </s-select>
            <s-select label="Refund type" value={add.type} onChange={(e) => setAdd({ ...add, type: e.currentTarget.value })}>
              <s-option value="">Select Refund Type</s-option>
              <s-option value="part">Part Refund</s-option>
              <s-option value="full">Full Refund</s-option>
            </s-select>
            <s-text-field label="Order No" value={add.orderName} onInput={(e) => setAdd({ ...add, orderName: e.currentTarget.value })} />
            <s-text-field label="Refundable Amount (£)" value={add.amount} onInput={(e) => setAdd({ ...add, amount: e.currentTarget.value })} />
            <s-text-field label="Transaction ID (optional)" value={add.transactionId} onInput={(e) => setAdd({ ...add, transactionId: e.currentTarget.value })} />
            <s-text-area label="Reason Notes" rows={3} value={add.notes} onInput={(e) => setAdd({ ...add, notes: e.currentTarget.value })} />
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" loading={busy === 'add' || undefined} onClick={submitAdd}>ADD ORDER</s-button>
              <s-button onClick={() => setAdding(false)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={toggleAll} /></s-table-header>
            {COLUMNS.map(([key, label]) => (
              <s-table-header key={label}>{key ? <s-button variant="tertiary" onClick={() => sortBy(key)}>{label}{applied.sort === key ? (applied.dir === 'asc' ? ' ↑' : ' ↓') : ''}</s-button> : label}</s-table-header>
            ))}
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => {
              const refunded = refundedText(r);
              const money = (minor) => formatMoney(minor, r.currency);
              return (
                <s-table-row key={r.id}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></s-table-cell>
                  <s-table-cell>{formatDate(r.createdAt)}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block">
                      <s-link href={`/orders/${numericId(r.orderId)}`}>{r.orderName}</s-link>
                      {r.orderDate && <s-text color="subdued">({formatDate(r.orderDate)})</s-text>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{ucfirst(r.type)}</s-table-cell>
                  <s-table-cell>{r.gateway ? <s-badge>{gatewayLabel(r.gateway)}</s-badge> : null}</s-table-cell>
                  <s-table-cell>{reasonLabel(r.reason)}</s-table-cell>
                  <s-table-cell>{ucfirst(r.notes)}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      <s-badge tone="neutral">Paid : {r.paidMinor === null ? '---' : money(r.paidMinor)}</s-badge>
                      {r.addedBy && <s-text color="subdued">({ucfirst(r.addedBy)})</s-text>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      <s-badge tone="critical">{money(r.amountMinor)}</s-badge>
                      <s-text tone={refunded.missingId ? 'critical' : undefined}>Refunded : {refunded.refunded}</s-text>
                      <s-text tone={refunded.missingId ? 'critical' : undefined}>Trans. ID : {refunded.transaction}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      {r.status === 'done' ? <s-badge tone="success">Refunded</s-badge> : <s-button tone="critical" href={`shopify:admin/orders/${numericId(r.orderId)}`} target="_blank">Refund</s-button>}
                      {verified && !r.transactionId && (
                        <s-stack direction="inline" gap="small-200" alignItems="end">
                          <s-text-field label="Transaction Id" labelAccessibilityVisibility="exclusive" placeholder="Transaction Id" value={txn[r.id] ?? ''} onInput={(e) => setTxn({ ...txn, [r.id]: e.currentTarget.value })} />
                          <s-button loading={busy === r.id || undefined} onClick={() => saveTransaction(r)}>Save</s-button>
                        </s-stack>
                      )}
                      {r.refundedAt && <s-text tone="success">{formatDate(r.refundedAt)}</s-text>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {r.status === 'done' && r.claimableApplies && (
                      <s-select label="Claimable" labelAccessibilityVisibility="exclusive" value={r.claimable ?? ''} disabled={!verified || busy === r.id || undefined} onChange={(e) => changeClaimable(r, e.currentTarget.value)}>
                        {claimOptions.map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
                      </s-select>
                    )}
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
        {!loading && rows.length === 0 && !error && <s-box padding="base"><s-text>No Record Found.</s-text></s-box>}
      </s-section>
      {loading && !data && <s-spinner accessibilityLabel="Loading refunds" />}
    </s-page>
  );
}
