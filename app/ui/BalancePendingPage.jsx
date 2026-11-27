import { useCallback, useEffect, useState } from 'react';
import { STATUSES, labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate, formatMoney, gatewayLabel, statusTone } from './orderList';
import { loadPending, pendingAllLink, pendingLink } from './balancePending';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const BY_NAME = [...STATUSES].sort((a, b) => a.label.localeCompare(b.label));

// Balance Pending (old Order menu): every order that still owes money, with what was paid and what is owed.
export default function BalancePendingPage() {
  const [query, setQuery] = useState({ page: 1, all: false, status: 0, q: '' });
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false);
  const [busy, setBusy] = useState(null); // 'ticked' | 'all'
  const [picked, setPicked] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadPending(query);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.orderId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const change = (next) => { setQuery((q) => ({ ...q, ...next })); setPicked(new Set()); setLink(null); };
  const runSearch = () => change({ q: search, page: 1, all: false });

  async function exportTicked() {
    if (data && data.total === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no records match.' }); return; }
    if (picked.size === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Please Select Record(s) to Export.' }); return; }
    setBusy('ticked');
    const res = await pendingLink([...picked], query.status);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }
  async function downloadAll() {
    if (data && data.total === 0 && !query.q && !query.status) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no order owes a balance.' }); return; }
    setBusy('all');
    const res = await pendingAllLink();
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Download All is ready: every item of every order that owes money (the link works for 5 minutes).' });
  }

  const first = data && data.total > 0 ? (query.all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (query.all ? data.total : Math.min(data.page * data.size, data.total)) : 0;
  const filtered = Boolean(query.q || query.status);

  return (
    <s-page heading={`Balance Pending${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/instock-balance">Instock Balance Due</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Status" value={String(query.status)} onChange={(e) => change({ status: Number(e.currentTarget.value), page: 1, all: false })}>
              <s-option value="0">--Status--</s-option>
              {BY_NAME.map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
            </s-select>
            <s-search-field label="Search" placeholder="Order No., email, name or payment type" value={search} onInput={(e) => setSearch(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
            <s-button onClick={runSearch}>GO</s-button>
            {filtered && <s-button onClick={() => { setSearch(''); change({ q: '', status: 0, page: 1, all: false }); }}>Reset</s-button>}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-stack direction="block" gap="small-500">
              <s-text type="strong">Balance : {formatMoney(data?.balanceMinor ?? 0, 'GBP')}</s-text>
              <s-text type="strong">Paid : {formatMoney(data?.paidMinor ?? 0, 'GBP')}</s-text>
            </s-stack>
            <s-text>{data ? `${first} - ${last} Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={query.all} onPage={(p) => change({ page: p, all: false })} onAll={() => change({ all: true })} />}
            <s-stack direction="inline" gap="small">
              <s-button disabled={(busy && busy !== 'all') || undefined} loading={busy === 'all' || undefined} onClick={downloadAll}>Download All</s-button>
              <s-button disabled={(busy && busy !== 'ticked') || undefined} loading={busy === 'ticked' || undefined} onClick={exportTicked}>Export ticked</s-button>
            </s-stack>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title={filtered ? 'No orders match' : 'No orders owe a balance'} hint={filtered ? 'Change the status or the search, or press Reset.' : 'Orders that still owe money will appear here.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.orderId)) : new Set())} /></s-table-header>
              <s-table-header listSlot="primary">Date</s-table-header>
              <s-table-header>Order No</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Postcode</s-table-header>
              <s-table-header>PayType</s-table-header>
              <s-table-header format="numeric">Total</s-table-header>
              <s-table-header format="numeric">Paid Amt.</s-table-header>
              <s-table-header format="numeric">Balance Amt.</s-table-header>
              <s-table-header>Refund</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.orderId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.orderId)} onChange={(e) => tick(r.orderId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)} tone="critical">{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{r.customer.toUpperCase()}</s-table-cell>
                  <s-table-cell>{r.postcode.toUpperCase()}</s-table-cell>
                  <s-table-cell>{r.payment ? gatewayLabel(r.payment) : ''}</s-table-cell>
                  <s-table-cell>{formatMoney(r.totalMinor, 'GBP')}</s-table-cell>
                  <s-table-cell>{formatMoney(r.paidMinor, 'GBP')}</s-table-cell>
                  <s-table-cell><s-text tone="critical">{formatMoney(r.balanceMinor, 'GBP')}</s-text></s-table-cell>
                  <s-table-cell>{r.refund === 'full' ? <s-badge tone="critical">Full refund</s-badge> : r.refund === 'part' ? <s-badge tone="warning">Part refund</s-badge> : ''}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      {r.statuses.map((id, i) => (id == null ? <s-badge key={i}>Not set</s-badge> : <s-badge key={i} tone={statusTone(id)}>{labelFor(id)}</s-badge>))}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
