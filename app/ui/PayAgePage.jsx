import { useCallback, useEffect, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate, formatMoney, statusTone } from './orderList';
import { PAY_AGE_TITLES, loadPayAge, payAgeLink } from './payAge';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const money = (minor) => (minor == null ? '—' : formatMoney(minor, 'GBP'));

// Proforma Payment Report (terms="proforma": pro-forma brands, lines Awaiting Payment / Pre-Payment) and Credit Payment Report
// (terms="credit": credit brands, lines In Stock). Brand and date filters, invoice amount with and without VAT, download of ticked lines.
export default function PayAgePage({ terms }) {
  const start = { terms, brand: '', from: '', to: '', page: 1, all: false };
  const [draft, setDraft] = useState(start);
  const [applied, setApplied] = useState(start);
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
    const res = await loadPayAge(applied);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const apply = (next) => { setApplied({ ...next, page: 1, all: false }); setPicked(new Set()); setLink(null); };

  async function download() {
    if (data && data.total === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no records match.' }); return; }
    if (picked.size === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Please Select Record(s) to Export.' }); return; }
    setBusy(true);
    const res = await payAgeLink(applied, [...picked]);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  const title = PAY_AGE_TITLES[terms];
  const first = data && data.total > 0 ? (applied.all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (applied.all ? data.total : Math.min(data.page * data.size, data.total)) : 0;

  return (
    <s-page heading={`${title}${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href={terms === 'credit' ? '/proforma-payment-report' : '/credit-payment-report'}>{PAY_AGE_TITLES[terms === 'credit' ? 'proforma' : 'credit']}</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {data && !data.brandTermsSet && (
        <s-banner tone="warning">No brand is set to {terms === 'credit' ? 'Credit' : 'Pro-forma'} yet. Set each brand's payment terms on the <s-link href="/brand-terms">Brand terms</s-link> page.</s-banner>
      )}
      {data?.costLookup === 'unavailable' && <s-banner tone="warning">Shopify could not be read for item costs just now, so amounts show blank. Press Refresh to try again.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Brand" value={draft.brand} onChange={(e) => { const next = { ...draft, brand: e.currentTarget.value }; setDraft(next); apply(next); }}>
              <s-option value="">-- Brand --</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button onClick={() => apply(draft)}>GO</s-button>
            {(applied.brand || applied.from || applied.to) && <s-button onClick={() => { setDraft(start); apply(start); }}>Reset</s-button>}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `Showing ${first} - ${last} Records Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={(p) => { setApplied({ ...applied, page: p, all: false }); setPicked(new Set()); setLink(null); }} onAll={() => { setApplied({ ...applied, all: true }); setPicked(new Set()); setLink(null); }} />}
            <s-button disabled={busy || undefined} loading={busy || undefined} onClick={download}>Export ticked</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No records" hint={terms === 'credit' ? 'Items of credit brands that are In Stock appear here.' : 'Items of pro-forma brands waiting for payment appear here.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.lineId)) : new Set())} /></s-table-header>
              <s-table-header listSlot="primary">Order Date</s-table-header>
              <s-table-header>Order No</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header>Item</s-table-header>
              <s-table-header>Product Code</s-table-header>
              <s-table-header format="numeric">Qty.</s-table-header>
              <s-table-header format="numeric">Invoice Amt.</s-table-header>
              <s-table-header format="numeric">Invoice+VAT Amt.</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{r.variantTitle ? <s-stack direction="block" gap="small-500"><s-text>{r.title}</s-text><s-text color="subdued">{r.variantTitle}</s-text></s-stack> : r.title}</s-table-cell>
                  <s-table-cell>{r.code}</s-table-cell>
                  <s-table-cell>{r.quantity}</s-table-cell>
                  <s-table-cell>{money(r.invoiceMinor)}{r.manualMinor ? <s-text color="subdued"> (manual)</s-text> : null}</s-table-cell>
                  <s-table-cell>{money(r.invoiceVatMinor)}</s-table-cell>
                  <s-table-cell>{r.statusId != null ? <s-badge tone={statusTone(r.statusId)}>{labelFor(r.statusId)}</s-badge> : ''}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
