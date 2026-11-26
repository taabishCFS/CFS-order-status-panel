import { useCallback, useEffect, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate, formatMoney, gatewayLabel, statusTone } from './orderList';
import { balanceLink, loadBalances } from './instockBalance';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;

// Instock Balance Due: orders that still owe money while every item is in stock, allocated or on its way.
export default function InstockBalancePage() {
  const [page, setPage] = useState(1);
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadBalances(page, all);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [page, all]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.orderId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const goPage = (p) => { setAll(false); setPage(p); setPicked(new Set()); setLink(null); };

  async function download() {
    if (data && data.total === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no records match.' }); return; }
    if (picked.size === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Please Select Record(s) to Export.' }); return; }
    setBusy(true);
    const res = await balanceLink([...picked]);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  const first = data && data.total > 0 ? (all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (all ? data.total : Math.min(data.page * data.size, data.total)) : 0;

  return (
    <s-page heading={`Instock Balance Due${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/instock-not-booked">Instock Delivery Not Booked</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-text>{data ? `${first} - ${last} Records Of ${data.total}` : 'Loading...'}</s-text>
          {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={all} onPage={goPage} onAll={() => { setAll(true); setPicked(new Set()); setLink(null); }} />}
          <s-button disabled={busy || undefined} loading={busy || undefined} onClick={download}>Export ticked</s-button>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No orders owe a balance" hint="Orders whose items are all in stock or on their way and still owe money will appear here." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.orderId)) : new Set())} /></s-table-header>
              <s-table-header listSlot="primary">Date</s-table-header>
              <s-table-header>Order No</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Postcode</s-table-header>
              <s-table-header>Payment Type</s-table-header>
              <s-table-header format="numeric">Order Total</s-table-header>
              <s-table-header format="numeric">Balance</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.orderId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.orderId)} onChange={(e) => tick(r.orderId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell><s-text tone="critical">{formatDate(r.orderDate)}</s-text></s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)} tone="critical">{r.orderName}</s-link></s-table-cell>
                  <s-table-cell><s-text tone="critical">{r.customer}</s-text></s-table-cell>
                  <s-table-cell><s-text tone="critical">{r.postcode}</s-text></s-table-cell>
                  <s-table-cell>{r.payment ? gatewayLabel(r.payment) : ''}</s-table-cell>
                  <s-table-cell><s-text tone="critical">{formatMoney(r.totalMinor, 'GBP')}</s-text></s-table-cell>
                  <s-table-cell><s-text tone="critical">{formatMoney(r.balanceMinor, 'GBP')}</s-text></s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      {r.statuses.map((id, i) => <s-badge key={i} tone={statusTone(id)}>{labelFor(id)}</s-badge>)}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      {data && rows.length > 0 && (
        <s-section>
          <s-text type="strong">Total balance shown: {formatMoney(data.balanceMinor, 'GBP')}</s-text>
        </s-section>
      )}
    </s-page>
  );
}
