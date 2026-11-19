import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { STATUSES } from '../../cfs-order-status/src/statuses';
import { loadOrdersPage } from './load';
import { brandsOf, buildRows, filterRows, summarize } from './rows';

// Opens the Order Detail page inside the app.
const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const date = (iso) => iso.slice(0, 10);
const dmy = (d) => (d ? d.split('-').reverse().join('/') : 'Not set');
const DELIVERY = { confirmed: 'Confirmed', declined: 'Declined' };
const money = (p) => (p ? `${p.currency} ${p.amount}` : 'Unavailable');

export default function OrdersByBrand() {
  const [orders, setOrders] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [brand, setBrand] = useState('');
  const [statusId, setStatusId] = useState('');
  const [search, setSearch] = useState('');
  const [noExpected, setNoExpected] = useState(false);

  const loadMore = useCallback(async (after, replace) => {
    setLoading(true);
    try {
      const page = await loadOrdersPage(after);
      setOrders((prev) => (replace ? page.orders : [...prev, ...page.orders]));
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadMore(null, true); }, [loadMore]);

  const allRows = useMemo(() => buildRows(orders), [orders]);
  const brands = useMemo(() => brandsOf(allRows), [allRows]);
  const shown = useMemo(
    () => filterRows(allRows, {
      brand: brand || undefined,
      statusId: statusId === '' ? undefined : statusId === 'none' ? 'none' : Number(statusId),
      search,
      noExpectedDate: noExpected,
    }),
    [allRows, brand, statusId, search, noExpected],
  );
  const totals = summarize(shown);
  const unreadable = allRows.some((r) => r.statusUnreadable);

  return (
    <s-page heading="Orders by Brand">
      <s-button slot="primary-action" onClick={() => loadMore(null, true)} loading={loading || undefined}>
        Refresh
      </s-button>

      {error && <s-banner tone="critical" heading="Could not load orders">{error}</s-banner>}
      {unreadable && (
        <s-banner tone="warning" heading="Some saved statuses could not be read">
          Affected lines show no status. Open the order to check it before changing anything.
        </s-banner>
      )}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-select label="Brand" value={brand} onChange={(e) => setBrand(e.currentTarget.value)}>
            <s-option value="">All brands</s-option>
            {brands.map((b) => <s-option key={b} value={b}>{b}</s-option>)}
          </s-select>
          <s-select label="Line status" value={statusId} onChange={(e) => setStatusId(e.currentTarget.value)}>
            <s-option value="">Any status</s-option>
            <s-option value="none">No status set</s-option>
            {STATUSES.map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
          </s-select>
          <s-search-field label="Search" placeholder="Order, product, variant or SKU" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
          <s-checkbox label="No expected date" checked={noExpected} onChange={(e) => setNoExpected(e.currentTarget.checked)} />
        </s-stack>
        <s-paragraph>
          {totals.lines} lines · {totals.orders} orders · {totals.units} units
          {cursor ? ' (loaded so far; more orders available)' : ''}
        </s-paragraph>
      </s-section>

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Order</s-table-header>
            <s-table-header>Date</s-table-header>
            <s-table-header>Brand</s-table-header>
            <s-table-header>Product</s-table-header>
            <s-table-header>SKU</s-table-header>
            <s-table-header format="numeric">Qty</s-table-header>
            <s-table-header>Expected date</s-table-header>
            <s-table-header>Delivery</s-table-header>
            <s-table-header format="numeric">Sold price</s-table-header>
            <s-table-header>Line status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {shown.map((r) => (
              <s-table-row key={r.lineId}>
                <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                <s-table-cell>{date(r.createdAt)}</s-table-cell>
                <s-table-cell>
                  {r.brand}{r.unmapped && <s-badge tone="warning">No vendor</s-badge>}
                </s-table-cell>
                <s-table-cell>{r.product}{r.variantTitle ? ` (${r.variantTitle})` : ''}</s-table-cell>
                <s-table-cell>{r.sku || 'Unavailable'}</s-table-cell>
                <s-table-cell>{r.quantity}</s-table-cell>
                <s-table-cell>{dmy(r.expectedDate)}</s-table-cell>
                <s-table-cell>{DELIVERY[r.delivery] || 'Not set'}</s-table-cell>
                <s-table-cell>{money(r.unitPrice)}</s-table-cell>
                <s-table-cell>{r.lineStatus ? r.lineStatus.label : 'Not set'}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {!loading && shown.length === 0 && !error && (
          <s-box padding="base"><s-text>No lines match.</s-text></s-box>
        )}
      </s-section>

      {cursor && (
        <s-button onClick={() => loadMore(cursor, false)} loading={loading || undefined}>
          Load older orders
        </s-button>
      )}
      {loading && !orders.length && <s-spinner accessibilityLabel="Loading orders" />}
    </s-page>
  );
}
