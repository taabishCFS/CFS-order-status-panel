import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatMoney } from './orderList';
import { PRESETS, loadOrderReport, orderReportLink, presetRange, ukToday } from './orderReports';

const money = (minor) => formatMoney(minor, 'GBP');
const dmy = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
const dmyText = (d) => d.split('-').reverse().join('/');
const CHARTS = [
  { key: 'brands', label: 'Brands', money: true, empty: 'No brand sales in this date range.' },
  { key: 'payments', label: 'Payments', money: true, empty: 'No payment sales in this date range.' },
  { key: 'lineStatuses', label: 'Order line statuses', money: false, empty: 'No order lines in this date range.' },
];
const COLUMNS = [
  ['Order No.', 'order'], ['Customer', 'customer'], ['Date', 'date'], ['Mode', 'mode'], ['Subtotal', null], ['Discount', null], ['Coupon', null],
  ['White Glove', null], ['Two Man', null], ['Scotland', null], ['Order Total', 'total'], ['Status', 'status'],
];

// Order Reports (old Downloads menu, middle/reports.inc): orders placed between two dates, filtered by order status. Shows the date range's sales,
// three charts (date range only), a sortable page of orders with page totals, and a line-by-line CSV (all brands or one).
export default function OrderReportsPage() {
  const today = ukToday();
  const [draft, setDraft] = useState({ from: today, to: today, statuses: [] });
  const [applied, setApplied] = useState({ from: today, to: today, statuses: [], sort: 'date', dir: 'desc', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'apply' | 'download'
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [showStatuses, setShowStatuses] = useState(false);
  const [statusSearch, setStatusSearch] = useState('');
  const [chart, setChart] = useState('brands');
  const [brand, setBrand] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadOrderReport(applied);
    setLoading(false);
    setBusy((b) => (b === 'apply' ? null : b));
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const changed = draft.from !== applied.from || draft.to !== applied.to || draft.statuses.join() !== applied.statuses.join();
  const apply = () => {
    if (!draft.from || !draft.to) { setNotice({ tone: 'warning', text: 'Choose the From and To dates.' }); return; }
    setBusy('apply');
    setLink(null);
    setNotice(null);
    setApplied((a) => ({ ...a, from: draft.from, to: draft.to, statuses: draft.statuses, page: 1 }));
  };
  const reset = () => {
    const blank = { from: today, to: today, statuses: [] };
    setDraft(blank);
    setLink(null);
    setNotice(null);
    setApplied({ ...blank, sort: 'date', dir: 'desc', page: 1 });
  };
  const sortBy = (key) => setApplied((a) => ({ ...a, sort: key, dir: a.sort === key && a.dir === 'desc' ? 'asc' : 'desc', page: 1 }));
  const toggleStatus = (id, on) => setDraft((d) => ({ ...d, statuses: on ? [...d.statuses, id] : d.statuses.filter((x) => x !== id) }));

  async function download() {
    if (!data || data.count === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no orders match.' }); return; }
    setBusy('download');
    const res = await orderReportLink(applied, brand);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  const statusChoices = useMemo(() => {
    const q = statusSearch.trim().toLowerCase();
    return (data?.statuses ?? []).filter((s) => !q || s.label.toLowerCase().includes(q));
  }, [data, statusSearch]);
  const pageCount = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;
  const first = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.count, data.page * data.pageSize) : 0;
  const chartInfo = CHARTS.find((c) => c.key === chart);
  const bars = data?.charts[chart] ?? [];
  const maxBar = Math.max(1, ...bars.map((b) => b.value));

  return (
    <s-page heading="Order Reports">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="primary-action" onClick={load} loading={(loading && busy !== 'apply') || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the report">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-text color="subdued">{dmyText(applied.from)} — {dmyText(applied.to)}</s-text>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <s-box border="base" borderRadius="base" padding="base">
              <s-stack gap="small-300"><s-text color="subdued">Matching orders</s-text><s-heading>{data ? String(data.count) : '…'}</s-heading><s-text color="subdued">Current date and status filters</s-text></s-stack>
            </s-box>
            <s-box border="base" borderRadius="base" padding="base">
              <s-stack gap="small-300"><s-text color="subdued">Date-range sales</s-text><s-heading>{data ? money(data.summary.salesMinor) : '…'}</s-heading><s-text color="subdued">Sales-eligible orders; date range only</s-text></s-stack>
            </s-box>
            <s-box border="base" borderRadius="base" padding="base">
              <s-stack gap="small-300"><s-text color="subdued">Avg. valid order</s-text><s-heading>{data ? money(data.summary.validAvgMinor) : '…'}</s-heading><s-text color="subdued">{data ? `${data.summary.validCount} orders with a positive total` : ''}</s-text></s-stack>
            </s-box>
          </s-grid>

          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button onClick={() => setShowStatuses((v) => !v)}>Order status: {draft.statuses.length ? `${draft.statuses.length} selected` : 'Default statuses'}</s-button>
            <s-button variant="primary" onClick={apply} loading={busy === 'apply' || undefined} disabled={(busy && busy !== 'apply') || undefined}>Apply filters</s-button>
            <s-button onClick={reset}>Reset</s-button>
          </s-stack>
          <s-stack direction="inline" gap="small-200">
            {PRESETS.map((p) => <s-button key={p} variant="tertiary" onClick={() => setDraft((d) => ({ ...d, ...presetRange(p, today) }))}>{p}</s-button>)}
          </s-stack>
          {changed && <s-text color="subdued">Filters changed. Apply filters to update the report.</s-text>}

          {showStatuses && (
            <s-box border="base" borderRadius="base" padding="base">
              <s-stack gap="base">
                <s-stack direction="inline" gap="base" alignItems="end">
                  <s-search-field label="Search statuses" labelAccessibilityVisibility="exclusive" placeholder="Search statuses" value={statusSearch} onInput={(e) => setStatusSearch(e.currentTarget.value)} />
                  <s-button onClick={() => setDraft((d) => ({ ...d, statuses: (data?.statuses ?? []).map((s) => s.id) }))}>Select all</s-button>
                  <s-button onClick={() => setDraft((d) => ({ ...d, statuses: [] }))}>Clear</s-button>
                </s-stack>
                <s-text color="subdued">With no selection, Deleted orders are excluded.</s-text>
                <s-grid gridTemplateColumns="repeat(auto-fill, minmax(220px, 1fr))" gap="small-200">
                  {statusChoices.map((s) => (
                    <s-checkbox key={s.id} label={s.label} checked={draft.statuses.includes(s.id) || undefined} onChange={(e) => toggleStatus(s.id, e.currentTarget.checked)} />
                  ))}
                </s-grid>
                {statusChoices.length === 0 && <s-text color="subdued">No statuses match your search.</s-text>}
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Charts">
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="View" value={chart} onChange={(e) => setChart(e.currentTarget.value)}>
              {CHARTS.map((c) => <s-option key={c.key} value={c.key}>{c.label}</s-option>)}
            </s-select>
            <s-text color="subdued">Date range only; independent of order status filters</s-text>
          </s-stack>
          {data && bars.length === 0 && <s-text color="subdued">{chartInfo.empty}</s-text>}
          {bars.map((b) => (
            <s-grid key={b.label} gridTemplateColumns="200px 1fr 110px" gap="base" alignItems="center">
              <s-text>{b.label}</s-text>
              <div style={{ background: 'rgba(54, 162, 235, 0.6)', border: '1px solid rgba(54, 162, 235, 1)', height: 16, borderRadius: 3, width: `${Math.max(1, (b.value / maxBar) * 100)}%` }} />
              <s-text>{chartInfo.money ? money(b.value) : String(b.value)}</s-text>
            </s-grid>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Orders">
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="end" justifyContent="space-between">
            <s-text>{data ? (data.count > 0 ? `Showing ${first} - ${last} Records Of ${data.count}` : 'No matching orders') : 'Loading...'}</s-text>
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-select label="Export brand" value={brand} onChange={(e) => setBrand(e.currentTarget.value)}>
                <s-option value="">All brands</s-option>
                {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
              </s-select>
              <s-button onClick={download} loading={busy === 'download' || undefined} disabled={(busy && busy !== 'download') || undefined}>Export data</s-button>
            </s-stack>
          </s-stack>
          {data && data.count > data.pageSize && <Pager page={data.page} pageCount={pageCount} all={false} onPage={(page) => setApplied((a) => ({ ...a, page }))} />}
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && data.rows.length === 0 ? (
          <EmptyState title="No Records Found." hint="Try other dates or order statuses." />
        ) : (
          <s-table loading={(loading && !data) || undefined}>
            <s-table-header-row>
              {COLUMNS.map(([label, key], i) => (
                <s-table-header key={label} listSlot={i === 0 ? 'primary' : undefined} format={['Subtotal', 'Discount', 'White Glove', 'Two Man', 'Scotland', 'Order Total'].includes(label) ? 'numeric' : undefined}>
                  {key ? <s-button variant="tertiary" onClick={() => sortBy(key)}>{label}{applied.sort === key ? (applied.dir === 'asc' ? ' ↑' : ' ↓') : ''}</s-button> : label}
                </s-table-header>
              ))}
            </s-table-header-row>
            <s-table-body>
              {(data?.rows ?? []).map((r) => (
                <s-table-row key={r.orderId}>
                  <s-table-cell><s-link href={`/orders/${r.orderId.split('/').pop()}`} tone={r.outstandingMinor > 0 ? 'critical' : undefined}>{r.name}</s-link></s-table-cell>
                  <s-table-cell>{r.customer}</s-table-cell>
                  <s-table-cell>{dmy(r.createdAt)}</s-table-cell>
                  <s-table-cell>{r.mode}</s-table-cell>
                  <s-table-cell>{money(r.subtotalMinor)}</s-table-cell>
                  <s-table-cell>{money(r.discountMinor)}</s-table-cell>
                  <s-table-cell>{r.coupon}</s-table-cell>
                  <s-table-cell>{money(r.whiteGloveMinor)}</s-table-cell>
                  <s-table-cell>{money(r.twoManMinor)}</s-table-cell>
                  <s-table-cell>{money(r.scotlandMinor)}</s-table-cell>
                  <s-table-cell>{money(r.totalMinor)}</s-table-cell>
                  <s-table-cell>{r.status || '—'}</s-table-cell>
                </s-table-row>
              ))}
              {data && data.rows.length > 0 && (
                <s-table-row>
                  <s-table-cell><s-text type="strong">Page total</s-text></s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(data.pageTotals.subtotalMinor)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(data.pageTotals.discountMinor)}</s-text></s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(data.pageTotals.whiteGloveMinor)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(data.pageTotals.twoManMinor)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(data.pageTotals.scotlandMinor)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(data.pageTotals.totalMinor)}</s-text></s-table-cell>
                  <s-table-cell></s-table-cell>
                </s-table-row>
              )}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
