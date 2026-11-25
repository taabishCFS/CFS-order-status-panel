import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { useStaff } from './useStaff';
import { formatDate, rangeText, statusTone } from './orderList';
import { MARK_BUTTONS, carryLines, loadBookable, markLines, ordersFromMaxproCsv } from './bulkDelivery';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Book Delivery, laid out like the old system: search, Mark TNT / PALLET / FURDECO, upload a Maxpro CSV, then tick lines and
// press "Book Delivery / Collection" to go to the Delivery Booking page. Plus a brand filter.
export default function BookDeliveryPage() {
  const { route } = useLocation();
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ q: '', brand: '', page: 1 });
  const [picked, setPicked] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // { kind: 'mark', key, label } | { kind: 'book' }
  const [csv, setCsv] = useState(null); // { name, text }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadBookable(applied);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const canWrite = !!staff;
  const none = picked.size === 0;

  function runSearch() { setApplied({ ...applied, q: search.trim(), page: 1 }); }

  function ask(next) {
    if (none) { setNotice({ tone: 'warning', text: next.kind === 'mark' ? 'Select Record(s) to Action.' : 'Please Select Record(s) to Book Delivery.' }); return; }
    setConfirm(next);
  }

  async function mark(key) {
    setBusy(true);
    const res = await markLines(key, [...picked]);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Updated: ${res.data.marked} item${res.data.marked === 1 ? '' : 's'} marked for ${key}.` });
    setPicked(new Set());
    await load();
  }

  function goBook() {
    // The ticked lines go to the booking page in the order they appear on this list.
    carryLines(rows.filter((r) => picked.has(r.lineId)).map((r) => r.lineId));
    route('/book-delivery/booking');
  }

  async function chooseFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) { setCsv(null); return; }
    if (file.size > MAX_CSV_BYTES) { setNotice({ tone: 'critical', text: 'That file is too big. Upload the Maxpro CSV file.' }); return; }
    try { setCsv({ name: file.name, text: await file.text() }); } catch { setNotice({ tone: 'critical', text: 'That file could not be read.' }); }
  }

  function loadCsv() {
    if (!csv) { setNotice({ tone: 'warning', text: 'Please select a CSV file to load.' }); return; }
    const parsed = ordersFromMaxproCsv(csv.text);
    if (!parsed.ok) { setNotice({ tone: 'critical', text: parsed.message }); return; }
    if (parsed.orders.length === 0) { setNotice({ tone: 'warning', text: 'No order numbers were found in that file.' }); return; }
    const q = parsed.orders.join(',');
    setSearch(q);
    setApplied({ ...applied, q, page: 1 });
    setPicked(new Set());
    setNotice({ tone: 'success', text: `Loaded ${parsed.orders.length} order number${parsed.orders.length === 1 ? '' : 's'} from ${csv.name}. The list shows those orders in the file's order.` });
  }

  const bookButton = (
    <s-button variant="primary" disabled={!canWrite || busy || undefined} onClick={() => ask({ kind: 'book' })}>Book Delivery / Collection</s-button>
  );

  return (
    <s-page heading="Book Delivery">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Marking and booking deliveries needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? rangeText(data.page, 100, data.total, false) : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={(page) => setApplied((a) => ({ ...a, page }))} />}
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field label="Search" placeholder="Search By : Order No., Postcode" value={search} onInput={(e) => setSearch(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
            <s-button onClick={runSearch}>Search</s-button>
            <s-select label="Brand / vendor" value={applied.brand} onChange={(e) => { setApplied({ ...applied, brand: e.currentTarget.value, page: 1 }); setPicked(new Set()); }}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
          </s-stack>

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-text type="strong">Mark :</s-text>
            {MARK_BUTTONS.map((m) => (
              <s-button key={m.key} disabled={!canWrite || busy || undefined} onClick={() => ask({ kind: 'mark', key: m.key, label: m.label })}>{m.label}</s-button>
            ))}
            {bookButton}
          </s-stack>

          <s-box padding="base" border="base" borderRadius="base">
            <s-stack gap="small">
              <s-text type="strong" tone="critical">Upload Maxpro CSV</s-text>
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-drop-zone label="Choose File" accept=".csv" onChange={chooseFile} />
                <s-button tone="critical" disabled={!csv || undefined} onClick={loadCsv}>Load</s-button>
                <s-text color="subdued">{csv ? csv.name : 'No file chosen'}</s-text>
              </s-stack>
            </s-stack>
          </s-box>

          {confirm && (
            <s-banner tone="warning" heading={confirm.kind === 'mark' ? `Mark ${picked.size} item${picked.size === 1 ? '' : 's'} as ${confirm.label}?` : `Book ${picked.size} item${picked.size === 1 ? '' : 's'}?`}>
              {confirm.kind === 'mark' ? 'They leave this list and go by that carrier.' : 'You will choose the date, van and drops on the next page.'}
              <s-button slot="primary-action" disabled={busy || undefined} loading={busy || undefined} onClick={() => (confirm.kind === 'mark' ? mark(confirm.key) : goBook())}>Confirm</s-button>
              <s-button slot="secondary-actions" onClick={() => setConfirm(null)}>Cancel</s-button>
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="Nothing to book" hint={applied.q || applied.brand ? 'No lines match that search. Clear it to see everything ready to book.' : 'No lines are ready to book. Lines appear here when they are in stock (or collection/exchange), the order is paid and every line is ready.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.lineId)) : new Set())} /></s-table-header>
              <s-table-header>Order Date</s-table-header>
              <s-table-header listSlot="primary">Order No.</s-table-header>
              <s-table-header>Item</s-table-header>
              <s-table-header>Code</s-table-header>
              <s-table-header format="numeric">Qty</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Postcode</s-table-header>
              <s-table-header>Delivery Type</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName} ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{formatDate(r.orderCreatedAt)}</s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-200">
                      <s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link>
                      {r.prebook && <s-badge tone="neutral">Prebook</s-badge>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{r.product}</s-table-cell>
                  <s-table-cell>{r.code}</s-table-cell>
                  <s-table-cell>{r.quantity}</s-table-cell>
                  <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : ''}</s-table-cell>
                  <s-table-cell>{r.postcode}</s-table-cell>
                  <s-table-cell>{r.deliveryType}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {data && rows.length > 0 && (
        <s-section>
          <s-stack gap="base" alignItems="center">
            {bookButton}
            <s-text tone="critical" type="strong">Total Unique Orders : {data.summary.orders}</s-text>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}
