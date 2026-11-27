import { Fragment, useCallback, useEffect, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import { formatMoney } from './orderList';
import { ukToday } from './orderReports';
import { SHORTCUTS, loadSupplierSales, shortcutRange, sortBrands } from './supplierSales';

const money = (minor) => formatMoney(minor, 'GBP');
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
const COLUMNS = [['brand', 'Brand'], ['sale', 'Sale Total (excl. delivery)'], ['grand', 'Grand Total (incl. delivery)'], ['units', 'Units']];

// Supplier Sales Summary (old Downloads menu, totalSupplierSaleReport): for the orders placed between two dates, one table per website with
// each brand's Sale Total (without delivery), Grand Total (with its share of the delivery charges) and Units. Store orders are one row.
// Order Breakup lists each brand's orders under it, with the delivery shares and a check against the order total.
export default function SupplierSalesPage() {
  const today = ukToday();
  const [draft, setDraft] = useState({ from: today, to: today });
  const [applied, setApplied] = useState({ from: today, to: today, detail: false });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // 'go' | 'detail' | 'refresh'
  const [sorts, setSorts] = useState({}); // site -> { key, asc }
  const [open, setOpen] = useState(new Set()); // `${site}|${brand}` rows showing their orders

  const load = useCallback(async () => {
    const res = await loadSupplierSales(applied.from, applied.to, applied.detail);
    setBusy(null);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const go = () => {
    if (!draft.from || !draft.to) { setNotice('Choose the From and To dates.'); return; }
    if (draft.to < draft.from) { setNotice('To Date must be >= From Date'); return; }
    setNotice(null);
    setBusy('go');
    setOpen(new Set());
    setApplied((a) => ({ ...a, ...draft }));
  };
  const toggleDetail = () => { setBusy('detail'); setOpen(new Set()); setApplied((a) => ({ ...a, detail: !a.detail })); };
  const sortBy = (site, key) => setSorts((s) => ({ ...s, [site]: { key, asc: s[site]?.key === key ? !s[site].asc : key === 'brand' ? true : false } }));
  const toggleRow = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <s-page heading="Supplier Sales Summary">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="primary-action" onClick={() => { setBusy('refresh'); load(); }} loading={busy === 'refresh' || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the report">{error}</s-banner>}
      {notice && <s-banner tone="warning" dismissible onDismiss={() => setNotice(null)}>{notice}</s-banner>}
      {data?.capped && <s-banner tone="warning">Only the newest 20,000 orders in these dates are counted. Choose fewer dates.</s-banner>}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button variant="primary" onClick={go} loading={busy === 'go' || undefined} disabled={(busy && busy !== 'go') || undefined}>Go</s-button>
            <s-button onClick={toggleDetail} loading={busy === 'detail' || undefined} disabled={(busy && busy !== 'detail') || undefined}>{applied.detail ? 'Hide Breakup' : 'Order Breakup'}</s-button>
          </s-stack>
          <s-stack direction="inline" gap="small-200">
            {SHORTCUTS.map(([label, preset]) => <s-button key={label} variant="tertiary" onClick={() => setDraft(shortcutRange(preset, today))}>{label}</s-button>)}
          </s-stack>
          <s-text color="subdued">{applied.from.split('-').reverse().join('/')} — {applied.to.split('-').reverse().join('/')}. Cancelled, Deleted, Order Failed, Awaiting Payment, Awaiting V12 Approval and Service Issue orders and replacement orders are left out.{applied.detail ? ' Click a brand to see its orders.' : ''}</s-text>
        </s-stack>
      </s-section>

      {data && data.sites.length === 0 && (
        <s-section><EmptyState title="No orders found for this period." hint="Try other dates." /></s-section>
      )}

      {(data?.sites ?? []).map((site) => {
        const sort = sorts[site.site] ?? { key: 'brand', asc: true };
        const brands = sortBrands(site.brands, sort.key, sort.asc);
        return (
          <s-section key={site.site} heading={site.label} padding="none">
            <s-table>
              <s-table-header-row>
                {COLUMNS.map(([key, label], i) => (
                  <s-table-header key={key} listSlot={i === 0 ? 'primary' : undefined} format={i > 0 ? 'numeric' : undefined}>
                    <s-button variant="tertiary" onClick={() => sortBy(site.site, key)}>{label}{sort.key === key ? (sort.asc ? ' ↑' : ' ↓') : ''}</s-button>
                  </s-table-header>
                ))}
                {data.detail && <s-table-header format="numeric">Orders</s-table-header>}
              </s-table-header-row>
              <s-table-body>
                {brands.map((b) => {
                  const id = `${site.site}|${b.brand}`;
                  const isOpen = open.has(id);
                  return (
                    <Fragment key={id}>
                      <s-table-row>
                        <s-table-cell>
                          {data.detail
                            ? <s-button variant="tertiary" onClick={() => toggleRow(id)}>{`${isOpen ? '▾' : '▸'} ${b.brand}`}</s-button>
                            : <s-text type="strong">{b.brand}</s-text>}
                          {b.store && <s-badge tone="info">store</s-badge>}
                        </s-table-cell>
                        <s-table-cell>{money(b.saleMinor)}</s-table-cell>
                        <s-table-cell><s-text type="strong">{money(b.grandMinor)}</s-text></s-table-cell>
                        <s-table-cell>{String(b.units)}</s-table-cell>
                        {data.detail && <s-table-cell>{String(b.orders?.length ?? 0)}</s-table-cell>}
                      </s-table-row>
                      {isOpen && (b.orders ?? []).map((o) => (
                        <s-table-row key={`${id}|${o.orderId}`}>
                          <s-table-cell>
                            <s-stack gap="small-300">
                              <s-link href={`/orders/${o.orderId.split('/').pop()}`}>{o.name}</s-link>
                              <s-text color="subdued">{day(o.createdAt)} · {o.status || 'No status'}</s-text>
                              <s-text color="subdued">{o.parts.length ? o.parts.map((x) => `${x.label}: ${money(x.minor)}`).join(', ') : 'Delivery: Free'}</s-text>
                            </s-stack>
                          </s-table-cell>
                          <s-table-cell>{money(o.saleMinor)}</s-table-cell>
                          <s-table-cell>{money(o.grandMinor)}</s-table-cell>
                          <s-table-cell>{String(o.qty)}</s-table-cell>
                          <s-table-cell>
                            {o.split || Math.abs(o.diffMinor) < 5
                              ? <s-badge tone="success">{o.split ? '✓ OK (split order)' : '✓ OK'}</s-badge>
                              : <s-badge tone="critical">{`±${money(Math.abs(o.diffMinor))}`}</s-badge>}
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </Fragment>
                  );
                })}
                <s-table-row>
                  <s-table-cell><s-text type="strong">Total</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(site.totals.saleMinor)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(site.totals.grandMinor)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{String(site.totals.units)}</s-text></s-table-cell>
                  {data.detail && <s-table-cell></s-table-cell>}
                </s-table-row>
              </s-table-body>
            </s-table>
          </s-section>
        );
      })}
    </s-page>
  );
}
