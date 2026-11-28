import { useCallback, useEffect, useRef, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate, statusTone } from './orderList';
import { loadServiceOrders, serviceOrdersLink } from './serviceIssueOrders';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');

// Service Issue Orders (old Order menu "Service Issue (Sameer)"): every item of a replacement or Service Issue order, and how long it took.
export default function ServiceIssueOrdersPage() {
  const empty = { from: '', to: '', takenBy: '', q: '', page: 1, all: false };
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState({ from: '', to: '', q: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'refresh' | 'csv'

  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    const res = await loadServiceOrders(query);
    if (mine !== latest.current) return;
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const change = (next) => { setLink(null); setQuery((q) => ({ ...q, page: 1, all: false, ...next })); };
  const search = () => change({ from: draft.from || draft.to, to: draft.to || draft.from, q: draft.q });
  const reset = () => { setDraft({ from: '', to: '', q: '' }); change(empty); };

  async function csv() {
    setBusy('csv');
    const res = await serviceOrdersLink(query);
    setBusy(null);
    if (!res.ok) { setLink(null); setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  const first = data && data.total > 0 ? (query.all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (query.all ? rows.length : Math.min(data.page * data.size, data.total)) : 0;

  return (
    <s-page heading={`Service Issue Orders${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/service-issues">Service Issue Report</s-button>
      <s-button slot="primary-action" loading={(loading && busy === 'refresh') || undefined} onClick={async () => { setBusy('refresh'); try { await load(); } finally { setBusy(null); } }}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-text color="subdued">Every item of a replacement order (number starting with R) or of an order with Service Issue. Process Duration is the days from the order to the day the item was Completed, Cancelled, Credit Note Received or Collection, or to today if it is still going.</s-text>
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field label="Order No." value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
            <s-date-field label="Sup. expected from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button variant="primary" onClick={search}>GO</s-button>
            <s-select label="Order Taken By" value={query.takenBy} onChange={(e) => change({ takenBy: e.currentTarget.value })}>
              <s-option value="">-- All --</s-option>
              {(data?.takers ?? []).map((t) => <s-option key={t} value={t}>{t.toUpperCase()}</s-option>)}
            </s-select>
            <s-button onClick={reset}>Reset</s-button>
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? (data.total ? `${first} - ${last} Records Of ${data.total}` : '0 Records') : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={query.all} onPage={(p) => setQuery((q) => ({ ...q, page: p, all: false }))} onAll={() => setQuery((q) => ({ ...q, all: true }))} />}
            <s-button loading={busy === 'csv' || undefined} onClick={csv}>Download CSV</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No service issue items" hint="No replacement or Service Issue order matches. Change the filters or press Reset." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order No</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header>Item</s-table-header>
              <s-table-header>Order Taken By</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Sup. Expected Date</s-table-header>
              <s-table-header>Completed Date</s-table-header>
              <s-table-header format="numeric">Process Duration</s-table-header>
              <s-table-header>Service Remarks</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      <s-text>{r.product}</s-text>
                      <s-text color="subdued">{[r.brand, r.sku, `Qty ${r.quantity}`].filter(Boolean).join(' · ')}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{r.takenBy ? r.takenBy.toUpperCase() : ''}</s-table-cell>
                  <s-table-cell>{r.statusId ? <s-badge tone={statusTone(r.statusId)}>{labelFor(r.statusId)}</s-badge> : <s-text color="subdued">Not set</s-text>}</s-table-cell>
                  <s-table-cell>{dmy(r.expectedDate)}</s-table-cell>
                  <s-table-cell>
                    {r.finishedAt ? (
                      <s-stack direction="block" gap="small-500">
                        <s-text>{formatDate(r.finishedAt)}</s-text>
                        {r.finishedBy && <s-text color="subdued">{r.finishedBy.toUpperCase()}</s-text>}
                      </s-stack>
                    ) : ''}
                  </s-table-cell>
                  <s-table-cell>{r.days === null ? <s-text color="subdued">Not known</s-text> : `${r.days} day${r.days === 1 ? '' : 's'}`}</s-table-cell>
                  <s-table-cell>{r.serviceRemarks ?? ''}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
