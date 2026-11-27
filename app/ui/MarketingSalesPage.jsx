import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from './orderList';
import { ukToday } from './orderReports';
import { GROUPS, NEXT_VIEW, SORTS, UNSPECIFIED, loadMarketing, marketingLink, quickDates, rowFilters, startFilters } from './marketingSales';

const money = (minor) => formatMoney(minor, 'GBP');
const count = (n) => Number(n).toLocaleString('en-GB');
const dmy = (d) => d.split('-').reverse().join('/');
const same = (a, b) => JSON.stringify({ ...a, page: 1 }) === JSON.stringify({ ...b, page: 1 });
const CHIP_KEYS = ['brand', 'range', 'category', 'product', 'search', 'site', 'source', 'status', 'order'];

// Marketing Sales Report (old Downloads menu, marketing_sales.php): item sales of eligible orders between two dates. Filter by brand, range,
// category, product, site, order source and status; break down by brand, range, category, product, month, day, order source or order;
// click through brand -> ranges -> products -> monthly sales, or to the orders behind any row. Download the breakdown as a CSV.
export default function MarketingSalesPage() {
  const today = ukToday();
  const start = startFilters(today);
  const [draft, setDraft] = useState(start);
  const [applied, setApplied] = useState(start);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(null); // 'apply' | 'export' | 'refresh'
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadMarketing(applied);
    setLoading(false);
    setBusy((b) => (b === 'export' ? b : null));
    if (res.ok) { setData(res.data); setError(null); } else { setData(null); setError(res.message); }
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  /** Show a new set of filters (both in the form and the results). */
  const show = (next) => { const f = { ...applied, page: 1, ...next }; setDraft(f); setApplied(f); setLink(null); setNotice(null); };
  const apply = () => { setBusy('apply'); setLink(null); setNotice(null); setApplied({ ...draft, page: 1 }); };
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.currentTarget.value, ...(key === 'brand' ? { range: '' } : {}) }));
  const changed = !same(draft, applied);

  async function exportCsv() {
    if (!data || data.groupCount === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no matching eligible sales.' }); return; }
    setBusy('export');
    const res = await marketingLink(applied);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  const choices = data?.choices;
  const statusLabel = (id) => choices?.statuses.find((s) => String(s.id) === String(id))?.label ?? id;
  const chipText = {
    brand: applied.brand, range: applied.range, category: applied.category, search: applied.search,
    product: applied.product && (data?.selectedProduct ? `${data.selectedProduct} (#${applied.product})` : `#${applied.product}`),
    site: applied.site === UNSPECIFIED ? 'Unspecified' : applied.site,
    source: applied.source === UNSPECIFIED ? 'Unspecified' : applied.source,
    status: applied.status && statusLabel(applied.status),
    order: applied.order && (data?.selectedOrder || `#${applied.order}`),
  };
  const chips = CHIP_KEYS.filter((k) => applied[k]);
  const group = applied.group;
  const isOrders = group === 'order';
  const shownFrom = data ? (data.page - 1) * data.pageSize : 0;

  return (
    <s-page heading="Marketing Sales Report">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" onClick={() => show({ group: 'order' })}>View matching orders</s-button>
      <s-button slot="primary-action" onClick={() => { setBusy('refresh'); load(); }} loading={busy === 'refresh' || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the report">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}
      {data?.capped && <s-banner tone="warning">Only the first 20,000 orders in these dates are counted. Choose fewer dates.</s-banner>}
      {data && !data.catalogOk && <s-banner tone="warning">Shopify could not be read for ranges and categories, so every product shows as "No collection" and "No category". Press Refresh to try again.</s-banner>}

      <s-section>
        <s-stack gap="base">
          <s-text color="subdued">{dmy(applied.from)} – {dmy(applied.to)} · inclusive · UK time</s-text>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-button variant="tertiary" onClick={() => show({ ...start, from: applied.from, to: applied.to })}>All sales</s-button>
            {applied.brand && <><s-text>›</s-text><s-button variant="tertiary" onClick={() => show({ range: '', product: '', order: '', group: 'range' })}>{applied.brand}</s-button></>}
            {applied.range && <><s-text>›</s-text><s-button variant="tertiary" onClick={() => show({ product: '', order: '', group: 'product' })}>{applied.range}</s-button></>}
            <s-text>›</s-text><s-text type="strong">{GROUPS[group]}</s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">Applied filters</s-text>
            {chips.length === 0 && <s-text color="subdued">All brands, ranges, categories, sites and sources</s-text>}
            {chips.map((k) => (
              <s-clickable-chip key={k} removable accessibilityLabel={`Remove ${k} filter`} onRemove={() => show({ [k]: '' })}>{`${k[0].toUpperCase()}${k.slice(1)}: ${chipText[k]}`}</s-clickable-chip>
            ))}
            {chips.length > 0 && <s-button variant="tertiary" onClick={() => show(Object.fromEntries(CHIP_KEYS.map((k) => [k, ''])))}>Clear all filters</s-button>}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Filters">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">Quick dates</s-text>
            {quickDates(today).map((q) => (
              <s-button key={q.label} variant={draft.from === q.from && draft.to === q.to ? 'secondary' : 'tertiary'} onClick={() => setDraft((d) => ({ ...d, from: q.from, to: q.to }))}>{q.label}</s-button>
            ))}
          </s-stack>
          <s-text color="subdued">Current periods run up to today. Weeks start Monday. Choose a period, then Apply filters.</s-text>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
            <s-date-field label="From date" value={draft.from} onChange={set('from')} />
            <s-date-field label="To date (inclusive)" value={draft.to} onChange={set('to')} />
            <s-select label="Brand" value={draft.brand} onChange={set('brand')}>
              <s-option value="">All brands</s-option>
              {(choices?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-select label="Range (collection)" value={draft.range} onChange={set('range')}>
              <s-option value="">All ranges</s-option>
              {[...new Set([...(choices?.ranges ?? []), draft.range].filter(Boolean))].map((r) => <s-option key={r} value={r}>{r}</s-option>)}
            </s-select>
            <s-select label="Category" value={draft.category} onChange={set('category')}>
              <s-option value="">All categories</s-option>
              {[...new Set([...(choices?.categories ?? []), draft.category].filter(Boolean))].map((c) => <s-option key={c} value={c}>{c}</s-option>)}
            </s-select>
            <s-text-field label="Product name or SKU" value={draft.search} maxLength={100} placeholder="Search saved order items" onInput={set('search')} />
            <s-select label="Break down by" value={draft.group} onChange={set('group')}>
              {Object.entries(GROUPS).map(([k, v]) => <s-option key={k} value={k}>{v}</s-option>)}
            </s-select>
            <s-select label="Sort by" value={draft.sort} onChange={set('sort')}>
              {SORTS.map(([k, v]) => <s-option key={k} value={k}>{v}</s-option>)}
            </s-select>
          </s-grid>
          <s-button variant="tertiary" onClick={() => setMore((m) => !m)}>{more ? '▾' : '▸'} More filters · product, site, source and status</s-button>
          {(more || draft.product || draft.site || draft.source || draft.status) && (
            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
              <s-text-field label="Product ID" value={draft.product} placeholder="Any product" onInput={set('product')} />
              <s-select label="Site" value={draft.site} onChange={set('site')}>
                <s-option value="">All sites</s-option>
                {(choices?.sites ?? []).map((s) => <s-option key={s} value={s}>{s}</s-option>)}
                {choices?.hasNoSite && <s-option value={UNSPECIFIED}>Unspecified</s-option>}
              </s-select>
              <s-select label="Order source" value={draft.source} onChange={set('source')}>
                <s-option value="">All order sources</s-option>
                {(choices?.sources ?? []).map((s) => <s-option key={s} value={s}>{s}</s-option>)}
                <s-option value={UNSPECIFIED}>Unspecified</s-option>
              </s-select>
              <s-select label="Eligible order status" value={draft.status} onChange={set('status')}>
                <s-option value="">All eligible statuses</s-option>
                {(choices?.statuses ?? []).map((s) => <s-option key={s.id} value={String(s.id)}>{s.label}</s-option>)}
              </s-select>
            </s-grid>
          )}
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button variant="primary" onClick={apply} loading={busy === 'apply' || undefined} disabled={(busy && busy !== 'apply') || undefined}>Apply filters</s-button>
            <s-button onClick={() => show(start)}>Start over</s-button>
            {changed && <s-button variant="tertiary" onClick={() => setDraft(applied)}>Discard changes</s-button>}
            {changed && <s-text color="subdued">Filters changed. Apply filters to update the results below.</s-text>}
          </s-stack>
        </s-stack>
      </s-section>

      {data && (
        <>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <s-clickable border="base" borderRadius="large" padding="base" background="base" onClick={() => show({ group: 'order' })} accessibilityLabel="Matching orders: view order list">
              <s-stack gap="small-300"><s-text color="subdued">Matching orders</s-text><s-heading>{count(data.summary.orders)}</s-heading><s-text color="subdued">View order list →</s-text></s-stack>
            </s-clickable>
            <s-box border="base" borderRadius="large" padding="base" background="base">
              <s-stack gap="small-300"><s-text color="subdued">Units sold</s-text><s-heading>{count(data.summary.units)}</s-heading><s-text color="subdued">Matching eligible items</s-text></s-stack>
            </s-box>
            <s-box border="base" borderRadius="large" padding="base" background="base">
              <s-stack gap="small-300"><s-text color="subdued">Item sales</s-text><s-heading>{money(data.summary.salesMinor)}</s-heading><s-text color="subdued">Matching items, excluding delivery</s-text></s-stack>
            </s-box>
            <s-box border="base" borderRadius="large" padding="base" background="base">
              <s-stack gap="small-300"><s-text color="subdued">Products sold</s-text><s-heading>{count(data.summary.products)}</s-heading><s-text color="subdued">Different products</s-text></s-stack>
            </s-box>
          </s-grid>

          <s-section heading={isOrders ? 'Matching orders' : `${GROUPS[group]} breakdown`}>
            <s-stack gap="base">
              <s-stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                <s-stack direction="inline" gap="small-200">
                  {Object.entries(GROUPS).map(([k, v]) => <s-button key={k} variant={group === k ? 'secondary' : 'tertiary'} onClick={() => show({ group: k })}>{v}</s-button>)}
                </s-stack>
                <s-button onClick={exportCsv} loading={busy === 'export' || undefined} disabled={(busy && busy !== 'export') || undefined}>Export CSV</s-button>
              </s-stack>
              <s-text color="subdued">{count(data.groupCount)} {isOrders ? 'orders' : 'groups'} · showing {data.rows.length} rows{isOrders ? '' : ' · click an order count to see its matching orders'}</s-text>
            </s-stack>
          </s-section>

          <s-section padding="none">
            <s-table loading={loading || undefined}>
              <s-table-header-row>
                <s-table-header listSlot="primary">{isOrders ? 'Order / placed date' : GROUPS[group]}</s-table-header>
                {(group === 'product' || isOrders) && <s-table-header>{isOrders ? 'Record' : 'Product ID / SKU'}</s-table-header>}
                {!isOrders && <s-table-header format="numeric">Orders</s-table-header>}
                <s-table-header format="numeric">Units</s-table-header>
                <s-table-header format="numeric">Item sales</s-table-header>
                <s-table-header>Details</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.rows.length === 0 && (
                  <s-table-row><s-table-cell><s-stack gap="small-300"><s-text type="strong">No matching eligible sales.</s-text><s-text color="subdued">Remove a filter above or change the period.</s-text></s-stack></s-table-cell></s-table-row>
                )}
                {data.rows.map((r, i) => {
                  const rf = rowFilters(group, r, applied);
                  const next = NEXT_VIEW[group];
                  return (
                    <s-table-row key={`${shownFrom + i}|${r.key}`}>
                      <s-table-cell>{r.name}</s-table-cell>
                      {group === 'product' && <s-table-cell>{r.productId ? `#${r.productId}` : '—'}{r.sku ? ` · ${r.sku}` : ''}</s-table-cell>}
                      {isOrders && <s-table-cell>Current · #{r.productId}</s-table-cell>}
                      {!isOrders && <s-table-cell>{rf ? <s-button variant="tertiary" accessibilityLabel={`View ${r.orders} orders for ${r.name}`} onClick={() => show({ ...rf, group: 'order' })}>{count(r.orders)}</s-button> : count(r.orders)}</s-table-cell>}
                      <s-table-cell>{count(r.units)}</s-table-cell>
                      <s-table-cell>{money(r.salesMinor)}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small-200">
                          {isOrders && <s-button variant="tertiary" onClick={() => show({ order: r.productId, group: 'product' })}>View matching items</s-button>}
                          {isOrders && <s-button variant="tertiary" href={`/orders/${r.productId}`}>Open order</s-button>}
                          {!isOrders && rf && next && <s-button variant="tertiary" onClick={() => show({ ...rf, group: next[0] })}>{next[1]}</s-button>}
                          {!isOrders && rf && <s-button variant="tertiary" onClick={() => show({ ...rf, group: 'order' })}>View orders</s-button>}
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </s-section>

          <s-section>
            <s-stack gap="base">
              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <s-text>Page {data.page} of {data.pageCount}</s-text>
                <s-stack direction="inline" gap="small-200">
                  {data.page > 1 && <s-button onClick={() => setApplied((a) => ({ ...a, page: data.page - 1 }))}>Previous</s-button>}
                  {data.page < data.pageCount && <s-button onClick={() => setApplied((a) => ({ ...a, page: data.page + 1 }))}>Next</s-button>}
                </s-stack>
              </s-stack>
              <s-text color="subdued">Sales are saved item values (price × quantity less the item's discount), excluding delivery and order-level adjustments such as a coupon on the whole order. Refunds/returns are not subtracted. Grouped order counts can overlap, and a product in two collections counts in both ranges.</s-text>
              <s-text color="subdued">Only orders with a total above £0 that are not replacements are included, and only items with a quantity. Orders and items in Cancelled, Deleted, Order Failed, Awaiting Payment, Payment Not Confirmed, Awaiting V12 Approval, Cancel-Removed or Payment Not Come are left out; other statuses, including return and refund ones, are kept. Ranges are the product's Shopify collections and Category is its Shopify category (or product type), as they are now.</s-text>
            </s-stack>
          </s-section>
        </>
      )}
    </s-page>
  );
}
