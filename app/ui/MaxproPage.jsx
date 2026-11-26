import { useCallback, useEffect, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { useStaff } from './useStaff';
import { rangeText, statusTone } from './orderList';
import { callBulkEmail } from './bulkEmail';
import { DELIVERY_UPDATE_MESSAGE, DELIVERY_UPDATE_SUBJECT, loadMaxpro, maxproLink } from './maxpro';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;

// Delivery Report CSV (Max), laid out like the old page: every paid order still to be delivered, with the Maxpro columns.
// Tick orders, then Export Order Wise or Export Product Wise (files for Maxpro), or Send Bulk Email (a delivery update).
// Plus a brand / vendor filter and the White Glove list.
export default function MaxproPage() {
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false); // so only Refresh spins when it is pressed, not on other reloads
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ q: '', brand: '', whiteGlove: false, all: false, page: 1 });
  const [picked, setPicked] = useState(new Set());
  const [link, setLink] = useState(null); // { url, label }
  const [busy, setBusy] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [subject, setSubject] = useState(DELIVERY_UPDATE_SUBJECT);
  const [message, setMessage] = useState(DELIVERY_UPDATE_MESSAGE);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadMaxpro(applied);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.orderId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const change = (patch) => { setApplied((a) => ({ ...a, ...patch })); setPicked(new Set()); setLink(null); };
  const runSearch = () => change({ q: search.trim(), page: 1, all: false });
  const lineIds = rows.filter((r) => picked.has(r.orderId)).flatMap((r) => r.lineIds);

  async function makeFile(kind, label) {
    if (picked.size === 0) { setNotice({ tone: 'warning', text: 'Please Select Record(s) to Export.' }); return; }
    setBusy(kind);
    const res = await maxproLink(kind, [...picked]);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink({ url: res.data.url, label });
    setNotice({ tone: 'success', text: `${label} is ready for ${picked.size} order${picked.size === 1 ? '' : 's'} (the link works for 5 minutes).` });
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
    setBusy('mail');
    const res = await callBulkEmail({ lineIds, subject, message, key: crypto.randomUUID(), dryRun: false });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const skipped = res.withoutEmail > 0 ? ` ${res.withoutEmail} order${res.withoutEmail === 1 ? ' has' : 's have'} no email address and ${res.withoutEmail === 1 ? 'was' : 'were'} skipped.` : '';
    setNotice({ tone: 'success', text: `${res.customers} email${res.customers === 1 ? '' : 's'} queued for ${res.orders} order${res.orders === 1 ? '' : 's'}.${skipped} Each order's Emails section shows the result.` });
    setMailOpen(false);
  }

  const title = applied.whiteGlove ? 'MAXPRO : White Glove' : 'MAXPRO';

  return (
    <s-page heading={title}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Sending emails needs a verified Shopify staff sign-in.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && notice.text.endsWith('5 minutes).') && <s-link href={link.url} target="_blank">Download {link.label}</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? rangeText(data.page, data.size, data.total, applied.all) : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={(page) => change({ page, all: false })} onAll={() => change({ all: true })} />}
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field label="Find order / customer" placeholder="Order No., customer, phone or postcode" value={search} onInput={(e) => setSearch(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
            <s-button onClick={runSearch}>Search</s-button>
            <s-select label="Brand / vendor" value={applied.brand} onChange={(e) => change({ brand: e.currentTarget.value, page: 1, all: false })}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button tone={applied.whiteGlove ? undefined : 'critical'} onClick={() => change({ whiteGlove: !applied.whiteGlove, page: 1, all: false })}>{applied.whiteGlove ? 'Back to all orders' : 'White Glove Orders'}</s-button>
            <s-button disabled={picked.size === 0 || staff === undefined || busy || undefined} onClick={() => { setNotice(null); setMailOpen(true); }}>Send Bulk Email</s-button>
            <s-button variant="primary" disabled={busy || undefined} loading={busy === 'maxpro-order' || undefined} onClick={() => makeFile('maxpro-order', 'MaxPro_Orderwise.csv')}>Export Order Wise</s-button>
            <s-button variant="primary" disabled={busy || undefined} loading={busy === 'maxpro-product' || undefined} onClick={() => makeFile('maxpro-product', 'MaxPro_Productwise.csv')}>Export Product Wise</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {mailOpen && (
        <s-section heading="Send Bulk Email">
          <s-stack direction="block" gap="base">
            <s-text>One delivery update per customer, covering all the selected orders they have.</s-text>
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
              <s-button variant="primary" disabled={!preview?.ok || !message.trim() || busy || staff === undefined || undefined} loading={busy === 'mail' || undefined} onClick={sendMail}>
                {preview?.ok ? `Send ${preview.customers} email${preview.customers === 1 ? '' : 's'}` : 'Send Updates'}
              </s-button>
              <s-button disabled={busy || undefined} onClick={() => setMailOpen(false)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="Nothing to deliver" hint={applied.q || applied.brand ? 'No orders match that search. Clear it to see everything.' : 'Orders appear here when they are paid, have an item ready to deliver and are not yet booked or sent by a carrier.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.orderId)) : new Set())} /></s-table-header>
              <s-table-header format="numeric">S.No.</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header listSlot="primary">Order No.</s-table-header>
              <s-table-header>Address 1</s-table-header>
              <s-table-header>Address 2</s-table-header>
              <s-table-header>Capacity</s-table-header>
              <s-table-header>Volume</s-table-header>
              <s-table-header>Distribution Centre</s-table-header>
              <s-table-header>Drop Window Start</s-table-header>
              <s-table-header>Drop Window End</s-table-header>
              <s-table-header>Drop Duration</s-table-header>
              <s-table-header>Client Name</s-table-header>
              <s-table-header>Contact No.</s-table-header>
              <s-table-header>Date From</s-table-header>
              <s-table-header>Date To</s-table-header>
              <s-table-header>Order Status</s-table-header>
              <s-table-header>Brands</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r, i) => (
                <s-table-row key={r.orderId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.orderId)} onChange={(e) => tick(r.orderId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{(data.page - 1) * (applied.all ? 0 : data.size) + i + 1}</s-table-cell>
                  <s-table-cell>{r.date}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{r.address1}</s-table-cell>
                  <s-table-cell>{r.address2}</s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell>CFS</s-table-cell>
                  <s-table-cell>{r.windowStart}</s-table-cell>
                  <s-table-cell>{r.windowEnd}</s-table-cell>
                  <s-table-cell>{r.duration}</s-table-cell>
                  <s-table-cell>{r.client}</s-table-cell>
                  <s-table-cell>{r.contact}</s-table-cell>
                  <s-table-cell>{r.dateFrom}</s-table-cell>
                  <s-table-cell>{r.dateTo}</s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      {r.statusIds.map((id, k) => (id != null ? <s-badge key={k} tone={statusTone(id)}>{labelFor(id)}</s-badge> : null))}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{r.brands.map((b) => `${b} |`).join(' ')}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
