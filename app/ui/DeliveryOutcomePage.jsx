import { useCallback, useEffect, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate, formatMoney, gatewayLabel, rangeText, statusTone } from './orderList';
import { PARTNER_OPTIONS, TITLES, dmy, loadOutcome, outcomeLink, today } from './deliveryOutcome';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;

// Delivery Completed and Failed Delivery / Collection, laid out like the old pages: filters (pay mode, van or carrier, dates,
// brand, search), the list, and a download of everything the filters match. Completed opens on today's deliveries, like the old page.
export default function DeliveryOutcomePage({ kind }) {
  const start = { kind, q: '', brand: '', van: '', pay: '', from: kind === 'completed' ? today() : '', to: kind === 'completed' ? today() : '', page: 1, all: false };
  const [draft, setDraft] = useState(start);
  const [applied, setApplied] = useState(start);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false); // so only Refresh spins when it is pressed, not on other reloads
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadOutcome(applied);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const go = (extra = {}) => { setApplied({ ...draft, page: 1, all: false, ...extra }); setLink(null); };
  const reset = () => { setDraft(start); setApplied(start); setLink(null); };
  const rows = data?.rows ?? [];
  const failed = kind === 'failed';

  async function download() {
    if (data && rows.length === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no records match.' }); return; }
    setBusy(true);
    const res = await outcomeLink(applied);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  return (
    <s-page heading={TITLES[kind]}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/delivery-booked">Delivery Booked</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && notice.text.startsWith('Your file') && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? rangeText(data.page, data.size, data.total, applied.all) : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={(page) => setApplied({ ...applied, page, all: false })} onAll={() => setApplied({ ...applied, all: true })} />}
            <s-button disabled={busy || undefined} loading={busy || undefined} onClick={download}>Download CSV</s-button>
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="end">
            {!failed && (
              <s-select label="Pay mode" value={draft.pay} onChange={(e) => setDraft({ ...draft, pay: e.currentTarget.value })}>
                <s-option value="">All Pay Mode</s-option>
                {(data?.payModes ?? []).map((p) => <s-option key={p} value={p}>{gatewayLabel(p)}</s-option>)}
              </s-select>
            )}
            <s-select label="Van" value={draft.van} onChange={(e) => setDraft({ ...draft, van: e.currentTarget.value })}>
              <s-option value="">All Van</s-option>
              {PARTNER_OPTIONS.map((p) => <s-option key={p} value={`partner:${p}`}>{p}</s-option>)}
              {(data?.vans ?? []).map((v) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
            </s-select>
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-select label="Brand / vendor" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.currentTarget.value })}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-search-field label="Search" placeholder="Order No., postcode or email" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
            <s-button variant="primary" onClick={() => go()}>GO</s-button>
            <s-button onClick={() => { setDraft({ ...draft, from: '', to: '' }); go({ from: '', to: '' }); }}>All dates</s-button>
            <s-button onClick={reset}>RESET</s-button>
          </s-stack>
          {kind === 'completed' && <s-text color="subdued">Opens on today's deliveries. Press All dates to see every completed line.</s-text>}
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title={failed ? 'No failed deliveries' : 'No completed deliveries'} hint="Nothing matches these filters. Change them and press GO, or press RESET." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order Date</s-table-header>
              <s-table-header listSlot="primary">Order No.</s-table-header>
              {!failed && <s-table-header>Email</s-table-header>}
              <s-table-header>Brand</s-table-header>
              <s-table-header>Item</s-table-header>
              {failed && <s-table-header>Code</s-table-header>}
              {failed && <s-table-header format="numeric">Qty</s-table-header>}
              <s-table-header>{failed ? 'Delivery Date' : 'Delv.Date/Van'}</s-table-header>
              {failed && <s-table-header>Driver</s-table-header>}
              {failed && <s-table-header>Reason</s-table-header>}
              {!failed && <s-table-header>Postcode/Type</s-table-header>}
              {!failed && <s-table-header>Pay Mode</s-table-header>}
              {!failed && <s-table-header format="numeric">Final Value</s-table-header>}
              {failed && <s-table-header>Delv.Type</s-table-header>}
              {failed && <s-table-header>Status</s-table-header>}
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  {!failed && <s-table-cell>{r.email}</s-table-cell>}
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{r.product}</s-table-cell>
                  {failed && <s-table-cell>{r.code}</s-table-cell>}
                  {failed && <s-table-cell>{r.quantity}</s-table-cell>}
                  <s-table-cell>{[dmy(r.date), r.van].filter(Boolean).join(' · ') || '—'}</s-table-cell>
                  {failed && <s-table-cell>{r.driver}</s-table-cell>}
                  {failed && <s-table-cell>{r.reason}</s-table-cell>}
                  {!failed && <s-table-cell>{[r.postcode, r.deliveryType].filter(Boolean).join(' · ')}</s-table-cell>}
                  {!failed && <s-table-cell>{r.payMode ? gatewayLabel(r.payMode) : ''}</s-table-cell>}
                  {!failed && <s-table-cell>{formatMoney(r.amountMinor, 'GBP')}</s-table-cell>}
                  {failed && <s-table-cell>{r.deliveryType}</s-table-cell>}
                  {failed && <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : ''}</s-table-cell>}
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
