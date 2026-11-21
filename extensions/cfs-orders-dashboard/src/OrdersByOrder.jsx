import { useCallback, useEffect, useState } from 'preact/hooks';
import { labelFor } from '../../cfs-order-status/src/statuses';
import { archiveOrders, loadBrands, loadOrderList } from './listApi';
import { runBackfill } from './mirrorSync';
import ExpandedOrder from './ExpandedOrder.jsx';
import Pager from './Pager.jsx';
import { formatDate, formatMoney, gatewayLabel, payTypeLabel, rangeText, statusTone } from './orderList';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const TONE = { red: 'critical', blue: 'info' };
const PAY_TONE = { paid: 'success', partial: 'warning', awaiting: 'neutral', failed: 'critical' };

// By Order: one row per order, 50 per page. Filters run on the backend, so they cover every order, not only the ones loaded.
export default function OrdersByOrder() {
  const [applied, setApplied] = useState({ page: 1, all: false, brand: '', from: '', to: '', q: '', archived: false });
  const [draft, setDraft] = useState({ brand: '', from: '', to: '', q: '' });
  const [brands, setBrands] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState([]); // orders whose lines are expanded, newest first

  useEffect(() => { loadBrands().then((r) => r.ok && setBrands(r.brands)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadOrderList(applied);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
    setPicked(new Set());
    setConfirming(false);
    setLoading(false);
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  const go = (extra = {}) => setApplied((a) => ({ ...a, ...draft, page: 1, all: false, ...extra }));
  const goPage = (page) => setApplied((a) => ({ ...a, page, all: false }));
  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.orderId));

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleOpen = (r) => setOpen((o) => (o.some((x) => x.orderId === r.orderId) ? o.filter((x) => x.orderId !== r.orderId) : [{ orderId: r.orderId, name: r.name }, ...o]));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.orderId)));

  // Copies every order from Shopify into the lists' data. Needed once after an update adds new fields; safe to repeat.
  async function refreshOrderData() {
    setRefreshing(true);
    const res = await runBackfill((n) => setNotice({ tone: 'info', text: `Refreshing order data: ${n} orders copied so far...` }));
    setRefreshing(false);
    setNotice(res.ok ? { tone: 'success', text: `Order data refreshed: ${res.count} orders copied.` } : { tone: 'critical', text: `Refresh stopped after ${res.count} orders: ${res.message}` });
    await load();
  }

  async function confirmArchive() {
    const restoring = applied.archived;
    const res = await archiveOrders([...picked], !restoring);
    if (res.ok) setNotice({ tone: 'success', text: `${res.count} order${res.count === 1 ? '' : 's'} ${restoring ? 'restored' : 'archived'}.` });
    else setNotice({ tone: 'critical', text: res.message });
    await load();
  }

  return (
    <s-page heading="Orders">
      <s-button slot="secondary-actions" href="/orders-by-brand">Orders by Brand</s-button>
      <s-button slot="secondary-actions" href="/email-templates">Email templates</s-button>
      <s-button slot="secondary-actions" onClick={refreshOrderData} loading={refreshing || undefined}>Refresh order data</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>

      {error && <s-banner tone="critical" heading="Could not load orders">{error}</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}
      {data?.capped && <s-banner tone="warning">Showing the newest 2,000 of {data.total} orders. Narrow the filters to see the rest.</s-banner>}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-select label="Filter by brand" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.currentTarget.value })}>
            <s-option value="">--- Filter By Brand ---</s-option>
            {brands.map((b) => <s-option key={b} value={b}>{b}</s-option>)}
          </s-select>
          <s-date-field label="Date from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
          <s-date-field label="Date to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
          <s-button variant="primary" onClick={() => go()}>GO</s-button>
          <s-search-field label="Search" placeholder="Order no, name, email, phone or postcode" value={draft.q}
            onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onChange={(e) => go({ q: e.currentTarget.value })} />
          <s-checkbox label="Archived orders" checked={applied.archived} onChange={(e) => go({ archived: e.currentTarget.checked })} />
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-text>{data ? rangeText(data.page, 50, data.total, applied.all) : 'Loading...'}</s-text>
          {data && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={goPage} onAll={() => setApplied((a) => ({ ...a, all: true, page: 1 }))} />}
          <s-button tone="critical" disabled={picked.size === 0 || undefined} onClick={() => setConfirming(true)}>
            {applied.archived ? 'Restore' : 'Archive'} selected ({picked.size})
          </s-button>
        </s-stack>
        {confirming && (
          <s-banner tone="warning" heading={`${applied.archived ? 'Restore' : 'Archive'} ${picked.size} order${picked.size === 1 ? '' : 's'}?`}>
            {applied.archived ? 'They will appear in the lists again.' : 'They are hidden from these lists, and nothing changes in Shopify. You can restore them from Archived orders.'}
            <s-button slot="primary-action" onClick={confirmArchive}>{applied.archived ? 'Restore' : 'Archive'}</s-button>
            <s-button slot="secondary-actions" onClick={() => setConfirming(false)}>Cancel</s-button>
          </s-banner>
        )}
      </s-section>

      {open.map((o) => <ExpandedOrder key={o.orderId} orderId={o.orderId} name={o.name} onClose={() => setOpen((list) => list.filter((x) => x.orderId !== o.orderId))} />)}

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={toggleAll} /></s-table-header>
            <s-table-header listSlot="primary">Date</s-table-header>
            <s-table-header>Site</s-table-header>
            <s-table-header>Order No</s-table-header>
            <s-table-header>Customer</s-table-header>
            <s-table-header>Pay Mode</s-table-header>
            <s-table-header format="numeric">Total</s-table-header>
            <s-table-header>Pay Type</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Lines</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => {
              const tone = TONE[r.tone];
              const statuses = r.lineStatuses.filter((id) => id != null);
              return (
                <s-table-row key={r.orderId}>
                  <s-table-cell><s-checkbox label={`Select ${r.name}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.orderId)} onChange={() => toggle(r.orderId)} /></s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block">
                      <s-text tone={tone}>{formatDate(r.createdAt)}</s-text>
                      <s-text color="subdued">{r.name}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{r.site ? <s-badge>{r.site}</s-badge> : null}</s-table-cell>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}><s-text tone={tone}>{r.name}</s-text></s-link></s-table-cell>
                  <s-table-cell>
                    <s-text tone={tone}>{r.customerName ?? r.email ?? 'Guest'}</s-text>
                    {r.repeatCustomer && <s-text> ★</s-text>}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-badge>{gatewayLabel(r.gateway)}</s-badge>
                      {r.orderTakenBy && <s-badge tone="critical">By : {r.orderTakenBy.toUpperCase()}</s-badge>}
                      {r.orderSource && r.orderSource !== 'Website' && <s-badge tone="success">{r.orderSource}</s-badge>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell><s-text tone={tone}>{formatMoney(r.totalMinor, r.currency)}</s-text></s-table-cell>
                  <s-table-cell><s-badge tone={PAY_TONE[r.payType]}>{payTypeLabel(r.payType)}</s-badge></s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      {statuses.length === 0 && <s-text>Not set</s-text>}
                      {statuses.map((id, i) => <s-badge key={`${id}-${i}`} tone={statusTone(id)}>{labelFor(id)}</s-badge>)}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-button variant="tertiary" onClick={() => toggleOpen(r)}>{open.some((x) => x.orderId === r.orderId) ? 'Hide' : 'Lines'}</s-button>
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
        {!loading && rows.length === 0 && !error && <s-box padding="base"><s-text>No orders match.</s-text></s-box>}
      </s-section>
      {loading && !data && <s-spinner accessibilityLabel="Loading orders" />}
    </s-page>
  );
}
