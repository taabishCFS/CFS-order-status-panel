import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveActor } from '../../extensions/cfs-order-status/src/identity';
import { useStaff } from './useStaff';
import { STATUSES, labelFor, statusById } from '../../extensions/cfs-order-status/src/statuses';
import { bulkChangeStatus, bulkExpectedDate, groupByOrder } from './bulk';
import { DEFAULT_MESSAGE, DEFAULT_SUBJECT, callBulkEmail } from './bulkEmail';
import { loadBrands, loadExportLink, loadLineList } from './listApi';
import Pager from './Pager.jsx';
import SummaryStrip from './SummaryStrip.jsx';
import EmptyState from './EmptyState.jsx';
import ProcessOrderButton from './ProcessOrderButton.jsx';
import { formatDate, formatMoney, lineTitle, matchesFind, rangeText, statusTone, stockBadge, toggleAll, toggleOne } from './orderList';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');

// Orders by Brand: one row per order line. Filters run on the backend, so they cover every order.
export default function OrdersByBrand() {
  const [applied, setApplied] = useState({ brand: '', statusId: null, from: '', to: '', insurance: false, page: 1, all: false });
  const [draft, setDraft] = useState({ brand: '', statusId: '', from: '', to: '' });
  const [brands, setBrands] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [find, setFind] = useState('');
  // undefined while checking, null when Shopify will not say who is signed in
  const staff = useStaff();
  const [name, setName] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [working, setWorking] = useState(false);
  const [report, setReport] = useState(null);
  const [exporting, setExporting] = useState(null); // 2 or 3 while a download link is being prepared
  const [exportNote, setExportNote] = useState(null); // { tone, text, link? }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubject, setBulkSubject] = useState(DEFAULT_SUBJECT);
  const [bulkMessage, setBulkMessage] = useState(DEFAULT_MESSAGE);
  const [bulkPreview, setBulkPreview] = useState(null); // { ok, ... } from a preview call, or null while loading
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState(null); // { tone, text }


  useEffect(() => { loadBrands().then((r) => r.ok && setBrands(r.brands)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadLineList(applied);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
    setPicked(new Set());
    setLoading(false);
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  const go = (extra = {}) => setApplied((a) => ({ ...a, brand: draft.brand, statusId: draft.statusId === '' ? null : Number(draft.statusId), from: draft.from, to: draft.to, page: 1, all: false, ...extra }));
  const goPage = (page) => setApplied((a) => ({ ...a, page, all: false }));
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => matchesFind(r, find)), [data, find]);
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const summary = data?.summary ?? { lines: 0, orders: 0, units: 0 };
  const orderNames = useMemo(() => new Map((data?.rows ?? []).map((r) => [r.orderId, r.orderName])), [data]);

  // Saves the ticked lines order by order, then says what was saved and what was not.
  async function runBulk(run, doneText) {
    let actor;
    try {
      actor = resolveActor(staff ?? null, name);
    } catch (e) {
      setReport({ tone: 'warning', heading: e.message, failed: [] });
      return;
    }
    setWorking(true);
    setReport(null);
    const result = await run(groupByOrder(data?.rows ?? [], picked), actor);
    setWorking(false);
    const failed = result.failed.map((f) => ({ name: orderNames.get(f.orderId) ?? f.orderId, message: f.message }));
    setReport({
      tone: failed.length ? 'warning' : 'success',
      heading: `${doneText}: saved ${result.saved.length} order${result.saved.length === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''}.`,
      failed,
    });
    await load();
  }

  // Asks for a download link covering every line the filters match (not just this page). The link opens in a new tab.
  async function download(kind) {
    setExporting(kind);
    setExportNote(null);
    const res = await loadExportLink(kind, applied);
    setExporting(null);
    if (!res.ok) { setExportNote({ tone: 'critical', text: res.message }); return; }
    setExportNote({ tone: 'success', text: `Export ${kind} is ready (up to 5,000 lines, the link works for 5 minutes).`, link: res.data });
  }

  // Who would be emailed for the ticked lines (a preview: nothing is sent).
  useEffect(() => {
    if (!bulkOpen) return undefined;
    if (picked.size === 0) { setBulkOpen(false); return undefined; }
    let current = true;
    setBulkPreview(null);
    callBulkEmail({ lineIds: [...picked], subject: bulkSubject, message: bulkMessage, key: 'preview', dryRun: true }).then((r) => { if (current) setBulkPreview(r); });
    return () => { current = false; };
  }, [bulkOpen, picked]);

  async function sendBulk() {
    setBulkBusy(true);
    setBulkNote(null);
    const res = await callBulkEmail({ lineIds: [...picked], subject: bulkSubject, message: bulkMessage, key: crypto.randomUUID(), dryRun: false });
    setBulkBusy(false);
    if (!res.ok) { setBulkNote({ tone: 'critical', text: res.message }); return; }
    const skipped = res.withoutEmail ? ` ${res.withoutEmail} order${res.withoutEmail === 1 ? ' has' : 's have'} no email address and got nothing.` : '';
    setBulkNote({ tone: 'success', text: `${res.customers} email${res.customers === 1 ? '' : 's'} queued for ${res.orders} order${res.orders === 1 ? '' : 's'}.${skipped} Each order's Emails section shows the result.` });
    setBulkOpen(false);
  }

  const noneTicked = picked.size === 0;
  const saveStatus = () => runBulk((groups, actor) => bulkChangeStatus({ groups, status: statusById(Number(bulkStatus)), actor }), 'Status changed');
  const saveDate = () => runBulk((groups, actor) => bulkExpectedDate({ groups, date: bulkDate || null, actor }), 'Expected date saved');

  return (
    <s-page heading={lineTitle(applied.brand, summary.lines)}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/">By Order</s-button>
      <s-button slot="secondary-actions" href="/refunds">Refund Orders List</s-button>
      <s-button slot="secondary-actions" href="/reports">Reports</s-button>
      <s-button slot="secondary-actions" href="/email-templates">Email templates</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>

      {error && <s-banner tone="critical" heading="Could not load lines">{error}</s-banner>}
      {data?.capped && <s-banner tone="warning">Showing the newest 5,000 of {summary.lines} lines. Narrow the filters to see the rest.</s-banner>}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-select label="Brand" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.currentTarget.value })}>
            <s-option value="">All brands</s-option>
            {brands.map((b) => <s-option key={b} value={b}>{b}</s-option>)}
          </s-select>
          <s-select label="Order status" value={draft.statusId} onChange={(e) => setDraft({ ...draft, statusId: e.currentTarget.value })}>
            <s-option value="">--Filter By Order Status--</s-option>
            {STATUSES.map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
          </s-select>
          <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
          <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
          <s-button variant="primary" onClick={() => go()}>GO</s-button>
          <s-button variant={applied.insurance ? 'primary' : 'secondary'} onClick={() => go({ insurance: !applied.insurance })}>Insurance</s-button>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-text>{data ? rangeText(data.page, 50, data.total, applied.all) : 'Loading...'}</s-text>
          {data && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={goPage} onAll={() => setApplied((a) => ({ ...a, all: true, page: 1 }))} />}
          <s-search-field label="Find in loaded lines" placeholder="Order, product or code" value={find} onInput={(e) => setFind(e.currentTarget.value)} />
        </s-stack>
        <SummaryStrip stats={[{ label: 'Lines', value: summary.lines }, { label: 'Orders', value: summary.orders }, { label: 'Units', value: summary.units }, { label: 'Selected', value: picked.size, tone: picked.size ? 'info' : undefined, note: 'ticked' }]} />
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-button disabled={exporting !== null || undefined} loading={exporting === 2 || undefined} onClick={() => download(2)}>Export 2 (chase-up sheet)</s-button>
          <s-button disabled={exporting !== null || undefined} loading={exporting === 3 || undefined} onClick={() => download(3)}>Export 3 (ordering sheet)</s-button>
        </s-stack>
        {exportNote && (
          <s-banner tone={exportNote.tone} dismissible onDismiss={() => setExportNote(null)}>
            {exportNote.text}
            {exportNote.link && <s-link href={exportNote.link.url} target="_blank">Download {exportNote.link.filename}</s-link>}
          </s-banner>
        )}
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-select label="CHANGE STATUS" value={bulkStatus} onChange={(e) => setBulkStatus(e.currentTarget.value)}>
            <s-option value="">Change status</s-option>
            {STATUSES.map((st) => <s-option key={st.id} value={String(st.id)}>{st.label}</s-option>)}
          </s-select>
          <s-button disabled={noneTicked || bulkStatus === '' || working || staff === undefined || undefined} loading={working || undefined} onClick={saveStatus}>Save status</s-button>
          <s-date-field label="Expected date" value={bulkDate} onChange={(e) => setBulkDate(e.currentTarget.value)} />
          <s-button disabled={noneTicked || working || staff === undefined || undefined} onClick={saveDate}>Save Expt. Date</s-button>
          <s-button disabled={noneTicked || undefined} onClick={() => { setBulkNote(null); setBulkOpen(true); }}>Send Bulk Email</s-button>
          <ProcessOrderButton lineIds={[...picked]} disabled={noneTicked || working} onDone={load} />
          {staff === null && <s-text-field label="Your name (not verified)" value={name} onInput={(e) => setName(e.currentTarget.value)} />}
        </s-stack>
        {report && (
          <s-banner tone={report.tone} heading={report.heading} dismissible onDismiss={() => setReport(null)}>
            {report.failed.map((f) => <s-paragraph key={f.name}>{f.name}: {f.message}</s-paragraph>)}
          </s-banner>
        )}
      </s-section>

      {bulkNote && <s-banner tone={bulkNote.tone} dismissible onDismiss={() => setBulkNote(null)}>{bulkNote.text}</s-banner>}
      {bulkOpen && (
        <s-section heading="Send Bulk Email">
          <s-stack direction="block" gap="base">
            <s-text>One email per customer. The selected order numbers are included in their message.</s-text>
            {!bulkPreview && <s-text>Checking recipients…</s-text>}
            {bulkPreview && !bulkPreview.ok && <s-banner tone="warning">{bulkPreview.message}</s-banner>}
            {bulkPreview?.ok && (
              <s-stack direction="block" gap="small-300">
                <s-text type="strong">Recipients ({bulkPreview.customers})</s-text>
                {bulkPreview.recipients.slice(0, 20).map((r) => (
                  <s-text key={r.email}>{r.name} · {r.email} · {r.orders.join(', ')}</s-text>
                ))}
                {bulkPreview.recipients.length > 20 && <s-text color="subdued">and {bulkPreview.recipients.length - 20} more</s-text>}
                {bulkPreview.withoutEmail > 0 && <s-text color="subdued">{bulkPreview.withoutEmail} selected order{bulkPreview.withoutEmail === 1 ? ' has' : 's have'} no email address and will be skipped.</s-text>}
              </s-stack>
            )}
            <s-text-field label="Email subject" value={bulkSubject} onInput={(e) => setBulkSubject(e.currentTarget.value)} />
            <s-text-area label="Message" rows={10} value={bulkMessage} onInput={(e) => setBulkMessage(e.currentTarget.value)} />
            <s-text color="subdued">Placeholders: {'{{customer_name}}'}, {'{{order_numbers}}'}</s-text>
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" disabled={!bulkPreview?.ok || !bulkMessage.trim() || bulkBusy || staff === undefined || undefined} loading={bulkBusy || undefined} onClick={sendBulk}>
                {bulkPreview?.ok ? `Send ${bulkPreview.customers} email${bulkPreview.customers === 1 ? '' : 's'}` : 'Send Updates'}
              </s-button>
              <s-button disabled={bulkBusy || undefined} onClick={() => setBulkOpen(false)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={() => setPicked(toggleAll(picked, rows))} /></s-table-header>
            <s-table-header listSlot="primary">Order</s-table-header>
            <s-table-header>Product</s-table-header>
            <s-table-header format="numeric">Qty</s-table-header>
            <s-table-header format="numeric">Sold Price</s-table-header>
            <s-table-header>Status / Delivery</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => (
              <s-table-row key={r.lineId}>
                <s-table-cell><s-checkbox label={`Select ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={() => setPicked(toggleOne(picked, r.lineId))} /></s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="small-500">
                    <s-stack direction="inline" gap="small-300" alignItems="center">
                      <s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link>
                      {r.site && <s-badge>{r.site}</s-badge>}
                    </s-stack>
                    <s-text color="subdued">{formatDate(r.orderCreatedAt)}</s-text>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="small-500">
                    <s-text>{r.product}</s-text>
                    <s-stack direction="inline" gap="small-300" alignItems="center">
                      {r.brand === 'Unmapped' ? <s-badge tone="warning">No vendor</s-badge> : <s-text type="strong">{r.brand}</s-text>}
                    </s-stack>
                    {(r.variantTitle || r.sku) && <s-text color="subdued">{[r.variantTitle, r.sku].filter(Boolean).join(' · ')}</s-text>}
                  </s-stack>
                </s-table-cell>
                <s-table-cell>{r.quantity}</s-table-cell>
                <s-table-cell>{formatMoney(r.priceMinor, r.currency)}</s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="small-500">
                    {r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : <s-text color="subdued">Not set</s-text>}
                    {stockBadge(r) && <s-badge tone={stockBadge(r).tone}>{stockBadge(r).text}</s-badge>}
                    <s-text color="subdued">Delivery: {dmy(r.expectedDate) || 'Not set'}</s-text>
                    <s-text tone={r.supplierInvoicePaid ? 'success' : 'critical'}>Supp. invoice: {r.supplierInvoicePaid ? 'Paid' : 'Not paid'}</s-text>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {!loading && rows.length === 0 && !error && <EmptyState title="No lines match" hint="Change the brand, status or dates and press GO." />}
      </s-section>
      {loading && !data && <s-spinner accessibilityLabel="Loading lines" />}
    </s-page>
  );
}
