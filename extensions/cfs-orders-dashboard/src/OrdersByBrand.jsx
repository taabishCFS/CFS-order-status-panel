import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { fetchStaffActor, resolveActor } from '../../cfs-order-status/src/identity';
import { STATUSES, labelFor, statusById } from '../../cfs-order-status/src/statuses';
import { bulkChangeStatus, bulkExpectedDate, groupByOrder } from './bulk';
import { loadBrands, loadLineList } from './listApi';
import { formatDate, formatMoney, lineTitle, matchesFind, siteLogo, statusTone, toggleAll, toggleOne } from './orderList';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');

// Orders by Brand: one row per order line. Filters run on the backend, so they cover every order.
export default function OrdersByBrand() {
  const [applied, setApplied] = useState({ brand: '', statusId: null, from: '', to: '', insurance: false });
  const [draft, setDraft] = useState({ brand: '', statusId: '', from: '', to: '' });
  const [brands, setBrands] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [find, setFind] = useState('');
  // undefined while checking, null when Shopify will not say who is signed in
  const [staff, setStaff] = useState(undefined);
  const [name, setName] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [working, setWorking] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => { fetchStaffActor().then(setStaff); }, []);

  useEffect(() => { loadBrands().then((r) => r.ok && setBrands(r.brands)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadLineList(applied);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
    setPicked(new Set());
    setLoading(false);
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  const go = (extra = {}) => setApplied((a) => ({ ...a, brand: draft.brand, statusId: draft.statusId === '' ? null : Number(draft.statusId), from: draft.from, to: draft.to, ...extra }));
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

  const noneTicked = picked.size === 0;
  const saveStatus = () => runBulk((groups, actor) => bulkChangeStatus({ groups, status: statusById(Number(bulkStatus)), actor }), 'Status changed');
  const saveDate = () => runBulk((groups, actor) => bulkExpectedDate({ groups, date: bulkDate || null, actor }), 'Expected date saved');

  return (
    <s-page heading={lineTitle(applied.brand, summary.lines)}>
      <s-button slot="secondary-actions" href="/">By Order</s-button>
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
          <s-text>{summary.lines} lines · {summary.orders} orders · {summary.units} units · No pagination</s-text>
          <s-text>{picked.size} lines selected</s-text>
          <s-search-field label="Find in loaded lines" placeholder="Order, product or code" value={find} onInput={(e) => setFind(e.currentTarget.value)} />
        </s-stack>
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
          {staff === null && <s-text-field label="Your name (not verified)" value={name} onInput={(e) => setName(e.currentTarget.value)} />}
        </s-stack>
        {report && (
          <s-banner tone={report.tone} heading={report.heading} dismissible onDismiss={() => setReport(null)}>
            {report.failed.map((f) => <s-paragraph key={f.name}>{f.name}: {f.message}</s-paragraph>)}
          </s-banner>
        )}
      </s-section>

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={() => setPicked(toggleAll(picked, rows))} /></s-table-header>
            <s-table-header>Site</s-table-header>
            <s-table-header listSlot="primary">Order No</s-table-header>
            <s-table-header>Brand</s-table-header>
            <s-table-header>Product</s-table-header>
            <s-table-header>Code</s-table-header>
            <s-table-header>Exp. Delivery</s-table-header>
            <s-table-header format="numeric">Qty</s-table-header>
            <s-table-header format="numeric">Sold Price</s-table-header>
            <s-table-header>Order Date</s-table-header>
            <s-table-header>Supp.Invoice Paid?</s-table-header>
            <s-table-header>Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => {
              const logo = siteLogo(r.site);
              return (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-checkbox label={`Select ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={() => setPicked(toggleOne(picked, r.lineId))} /></s-table-cell>
                  <s-table-cell>{logo ? <s-image src={logo} alt={r.site} inlineSize="fill" /> : <s-text>{r.site ?? ''}</s-text>}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{r.brand}{r.brand === 'Unmapped' && <s-badge tone="warning">No vendor</s-badge>}</s-table-cell>
                  <s-table-cell>{r.product}{r.variantTitle ? ` (${r.variantTitle})` : ''}</s-table-cell>
                  <s-table-cell>{r.sku ?? ''}</s-table-cell>
                  <s-table-cell>{dmy(r.expectedDate)}</s-table-cell>
                  <s-table-cell>{r.quantity}</s-table-cell>
                  <s-table-cell>{formatMoney(r.priceMinor, r.currency)}</s-table-cell>
                  <s-table-cell>{formatDate(r.orderCreatedAt)}</s-table-cell>
                  <s-table-cell><s-text tone={r.supplierInvoicePaid ? 'success' : 'critical'}>{r.supplierInvoicePaid ? 'Yes' : 'No'}</s-text></s-table-cell>
                  <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : <s-text>Not set</s-text>}</s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
        {!loading && rows.length === 0 && !error && <s-box padding="base"><s-text>No lines match.</s-text></s-box>}
      </s-section>
      {loading && !data && <s-spinner accessibilityLabel="Loading lines" />}
    </s-page>
  );
}
