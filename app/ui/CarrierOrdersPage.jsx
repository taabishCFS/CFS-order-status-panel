import { useCallback, useEffect, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { callBulkEmail } from './bulkEmail';
import { DELIVERY_UPDATE_MESSAGE, DELIVERY_UPDATE_SUBJECT } from './maxpro';
import { formatDate, formatMoney, rangeText, statusTone } from './orderList';
import { PAGES, carrierLink, loadCarrier } from './carrierOrders';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

// The Carrier Deliveries pages, laid out like the old ones: filters, a list of lines, a delivery-update email to the ticked
// customers and a download of everything shown. `carrier` picks the page: tnt, pallet, furdeco, dhd, white-glove or allocated.
export default function CarrierOrdersPage({ carrier }) {
  const page = PAGES[carrier];
  const start = { key: carrier, q: '', brand: '', van: '', from: '', to: '', page: 1, all: false };
  const [draft, setDraft] = useState(start);
  const [applied, setApplied] = useState(start);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [subject, setSubject] = useState(DELIVERY_UPDATE_SUBJECT);
  const [message, setMessage] = useState(DELIVERY_UPDATE_MESSAGE);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadCarrier(applied);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const go = (extra = {}) => { setApplied({ ...draft, page: 1, all: false, ...extra }); setPicked(new Set()); setLink(null); };
  const reset = () => { setDraft(start); setApplied(start); setPicked(new Set()); setLink(null); };
  const lineIds = [...picked];

  async function download() {
    setBusy(true);
    const res = await carrierLink(applied);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  useEffect(() => {
    if (!mailOpen) return undefined;
    if (lineIds.length === 0) { setMailOpen(false); return undefined; }
    let current = true;
    setPreview(null);
    callBulkEmail({ lineIds, subject, message, key: 'preview', dryRun: true }).then((r) => { if (current) setPreview(r); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailOpen, picked]);

  async function sendMail() {
    setBusy(true);
    const res = await callBulkEmail({ lineIds, subject, message, key: crypto.randomUUID(), dryRun: false });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const skipped = res.withoutEmail > 0 ? ` ${res.withoutEmail} order${res.withoutEmail === 1 ? ' has' : 's have'} no email address and ${res.withoutEmail === 1 ? 'was' : 'were'} skipped.` : '';
    setNotice({ tone: 'success', text: `${res.customers} email${res.customers === 1 ? '' : 's'} queued for ${res.orders} order${res.orders === 1 ? '' : 's'}.${skipped} Each order's Emails section shows the result.` });
    setMailOpen(false);
  }

  return (
    <s-page heading={`${page.title}${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/delivery-booked">Delivery Booked</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>
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
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={(p) => setApplied({ ...applied, page: p, all: false })} onAll={() => setApplied({ ...applied, all: true })} />}
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Brand / vendor" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.currentTarget.value })}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            {page.vanFilter && (
              <s-select label="Van" value={draft.van} onChange={(e) => setDraft({ ...draft, van: e.currentTarget.value })}>
                <s-option value="">All Van</s-option>
                {(data?.vans ?? []).map((v) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
              </s-select>
            )}
            <s-date-field label="Delivery date from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-search-field label="Search" placeholder="Order No., postcode or email" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
            <s-button variant="primary" onClick={() => go()}>GO</s-button>
            <s-button onClick={() => { setDraft({ ...draft, from: '', to: '' }); go({ from: '', to: '' }); }}>All dates</s-button>
            <s-button onClick={reset}>RESET</s-button>
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button disabled={picked.size === 0 || undefined} onClick={() => { setNotice(null); setMailOpen(true); }}>{page.emailLabel}</s-button>
            <s-button disabled={busy || undefined} loading={busy || undefined} onClick={download}>Download CSV</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {mailOpen && (
        <s-section heading={page.emailLabel}>
          <s-stack direction="block" gap="base">
            <s-text>One delivery update per customer, covering all the selected lines they have.</s-text>
            {!preview && <s-text>Checking recipients…</s-text>}
            {preview && !preview.ok && <s-banner tone="warning">{preview.message}</s-banner>}
            {preview?.ok && (
              <s-stack direction="block" gap="small-300">
                <s-text type="strong">Recipients ({preview.customers})</s-text>
                {preview.recipients.slice(0, 20).map((r) => <s-text key={r.email}>{r.name} · {r.email} · {r.orders.join(', ')}</s-text>)}
                {preview.recipients.length > 20 && <s-text color="subdued">and {preview.recipients.length - 20} more</s-text>}
                {preview.withoutEmail > 0 && <s-text color="subdued">{preview.withoutEmail} selected order{preview.withoutEmail === 1 ? ' has' : 's have'} no email address and will be skipped.</s-text>}
              </s-stack>
            )}
            <s-text-field label="Email subject" value={subject} onInput={(e) => setSubject(e.currentTarget.value)} />
            <s-text-area label="Message" rows={10} value={message} onInput={(e) => setMessage(e.currentTarget.value)} />
            <s-text color="subdued">Placeholders: {'{{customer_name}}'}, {'{{order_numbers}}'}</s-text>
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" disabled={!preview?.ok || !message.trim() || busy || undefined} loading={busy || undefined} onClick={sendMail}>
                {preview?.ok ? `Send ${preview.customers} email${preview.customers === 1 ? '' : 's'}` : 'Send Updates'}
              </s-button>
              <s-button disabled={busy || undefined} onClick={() => setMailOpen(false)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="Nothing here" hint="No lines match. Change the filters and press GO, or press RESET." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.lineId)) : new Set())} /></s-table-header>
              <s-table-header>Order Date</s-table-header>
              <s-table-header listSlot="primary">Order No</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header>Post Code</s-table-header>
              <s-table-header>Item</s-table-header>
              <s-table-header format="numeric">Qty</s-table-header>
              <s-table-header>Cust.Date</s-table-header>
              {page.vanFilter && <s-table-header>Van</s-table-header>}
              <s-table-header>Status</s-table-header>
              <s-table-header>Email?</s-table-header>
              <s-table-header format="numeric">Unit Total</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName} ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{r.postcode}</s-table-cell>
                  <s-table-cell>{r.product}</s-table-cell>
                  <s-table-cell>{r.quantity}</s-table-cell>
                  <s-table-cell>{dmy(r.custDate) || '—'}</s-table-cell>
                  {page.vanFilter && <s-table-cell>{r.van}</s-table-cell>}
                  <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : ''}</s-table-cell>
                  <s-table-cell>{r.emailed ? 'Yes' : 'No'}</s-table-cell>
                  <s-table-cell>{formatMoney(r.amountMinor, 'GBP')}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
