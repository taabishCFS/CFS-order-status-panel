import { useCallback, useEffect, useRef, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate, statusTone } from './orderList';
import { RETURN_ACTIONS, loadReturned, markReturned } from './returnedItems';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;

// Returned Items (old Order menu): every cancelled item, why it was cancelled, and what was done with the goods once back.
export default function ReturnedItemsPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'refresh' | 'mark'
  const [picked, setPicked] = useState(new Set());
  const [action, setAction] = useState('');

  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    const res = await loadReturned(page, q);
    if (mine !== latest.current) return;
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [page, q]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const runSearch = () => { setPicked(new Set()); setPage(1); setQ(search); };

  async function mark() {
    if (picked.size === 0) { setNotice({ tone: 'warning', text: 'Please tick the item(s) first.' }); return; }
    if (!action) { setNotice({ tone: 'warning', text: 'Select a Return Action.' }); return; }
    setBusy('mark');
    const res = await markReturned([...picked], action);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const label = RETURN_ACTIONS.find((a) => a.value === action)?.label ?? action;
    const skipped = res.data.skipped ? ` ${res.data.skipped} item(s) were skipped because they are no longer Cancelled.` : '';
    setNotice({ tone: 'success', text: `${res.data.marked} item(s) marked ${label}.${skipped}` });
    setPicked(new Set());
    await load();
  }

  const first = data && data.total > 0 ? (data.page - 1) * data.size + 1 : 0;
  const last = data ? Math.min(data.page * data.size, data.total) : 0;

  return (
    <s-page heading={`Returned Items${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/stock">Free Stock</s-button>
      <s-button slot="primary-action" loading={(loading && busy === 'refresh') || undefined} onClick={async () => { setBusy('refresh'); try { await load(); } finally { setBusy(null); } }}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Return Action" value={action} onChange={(e) => setAction(e.currentTarget.value)}>
              <s-option value="">-- Return Action --</s-option>
              {RETURN_ACTIONS.map((a) => <s-option key={a.value} value={a.value}>{a.label}</s-option>)}
            </s-select>
            <s-button variant="primary" loading={busy === 'mark' || undefined} disabled={(busy && busy !== 'mark') || undefined} onClick={mark}>Action</s-button>
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field label="Search" placeholder="Order No." value={search} onInput={(e) => setSearch(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
            <s-button onClick={runSearch}>GO</s-button>
            {q && <s-button onClick={() => { setSearch(''); setPicked(new Set()); setPage(1); setQ(''); }}>Reset</s-button>}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `${first} - ${last} Records Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={(p) => { setPicked(new Set()); setPage(p); }} />}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title={q ? 'No returned items match' : 'No returned items'} hint={q ? 'Check the order number or press Reset.' : 'Items set to Cancelled on an order will appear here.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.lineId)) : new Set())} /></s-table-header>
              <s-table-header listSlot="primary">Order Date</s-table-header>
              <s-table-header>Order No</s-table-header>
              <s-table-header>Item</s-table-header>
              <s-table-header>Product Code</s-table-header>
              <s-table-header format="numeric">Qty.</s-table-header>
              <s-table-header>Reason</s-table-header>
              <s-table-header>Order Status</s-table-header>
              <s-table-header>Action..?</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-checkbox label={`Select ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      <s-text>{r.product}</s-text>
                      <s-text color="subdued">{[r.brand, r.variantTitle].filter(Boolean).join(' · ')}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{r.sku}</s-table-cell>
                  <s-table-cell>{r.quantity}</s-table-cell>
                  <s-table-cell>{r.reason || <s-text color="subdued">Not given</s-text>}</s-table-cell>
                  <s-table-cell><s-badge tone={statusTone(r.statusId)}>{labelFor(r.statusId)}</s-badge></s-table-cell>
                  <s-table-cell>
                    {r.action ? (
                      <s-stack direction="block" gap="small-500">
                        <s-badge tone="info">{r.actionLabel}</s-badge>
                        <s-text color="subdued">{r.actionBy}{r.actionAt ? `, ${formatDate(r.actionAt)}` : ''}</s-text>
                      </s-stack>
                    ) : ''}
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
