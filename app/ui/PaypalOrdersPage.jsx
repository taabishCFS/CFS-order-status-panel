import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import { formatDate, statusTone } from './orderList';
import { filterReport, loadPaypal } from './paypalOrders';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const gbp = (minor) => `£${(minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '0%');
const RANGES = [['7d', '7 Days'], ['30d', '30 Days'], ['90d', '90 Days'], ['6m', '6 Months'], ['1y', '1 Year'], ['all', 'All Time']];
const gatewayName = (g) => (g === 'paypal' ? 'PayPal' : g);

function Tile({ label, value, sub }) {
  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack direction="block" gap="small-300">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
        <s-text color="subdued">{sub}</s-text>
      </s-stack>
    </s-box>
  );
}

// Paypal Orders (old Order menu): the items of PayPal orders in a date range, grouped by colour group, then status, then order.
export default function PaypalOrdersPage() {
  const [query, setQuery] = useState({ from: '', to: '', range: '90d', gateway: 'paypal' });
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'refresh'
  const [text, setText] = useState('');
  const [open, setOpen] = useState(() => new Set()); // 'g:green' | 's:green:4' | 'o:4:gid'

  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    const res = await loadPaypal(query);
    if (mine !== latest.current) return;
    setLoading(false);
    if (res.ok) {
      setData(res.data);
      setError(null);
      setDraft({ from: res.data.from, to: res.data.to });
    } else setError(res.message);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => filterReport(data?.groups ?? [], text), [data, text]);
  const toggle = (key) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const searching = text.trim() !== '';
  const isOpen = (key) => searching || open.has(key);
  const expandAll = () => setOpen(new Set(groups.flatMap((g) => [`g:${g.key}`, ...g.statuses.map((s) => `s:${g.key}:${s.statusId}`)])));
  const t = data?.totals;
  const gateways = [...new Set(['paypal', ...(data?.gateways ?? []).map((g) => g.toLowerCase())])];

  return (
    <s-page heading={`${gatewayName(query.gateway) === 'PayPal' ? 'Paypal' : gatewayName(query.gateway)} Orders`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="primary-action" loading={(loading && busy === 'refresh') || undefined} onClick={async () => { setBusy('refresh'); try { await load(); } finally { setBusy(null); } }}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the report">{error}</s-banner>}
      {data?.capped && <s-banner tone="warning">Only the newest 5,000 orders in these dates are counted. Pick a shorter range.</s-banner>}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button variant="primary" onClick={() => setQuery((q) => ({ ...q, ...draft, range: 'custom' }))}>Apply</s-button>
            <s-select label="Payment method" value={query.gateway} onChange={(e) => setQuery((q) => ({ ...q, gateway: e.currentTarget.value }))}>
              {gateways.map((g) => <s-option key={g} value={g}>{gatewayName(g)}</s-option>)}
            </s-select>
          </s-stack>
          <s-stack direction="inline" gap="small">
            {RANGES.map(([key, label]) => (
              <s-button key={key} variant={query.range === key ? 'primary' : 'secondary'} onClick={() => setQuery((q) => ({ ...q, range: key }))}>{label}</s-button>
            ))}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="end" justifyContent="space-between">
            <s-search-field label="Search" placeholder="Order no or product" value={text} onInput={(e) => setText(e.currentTarget.value)} />
            <s-stack direction="inline" gap="small">
              <s-button variant="tertiary" onClick={expandAll}>Expand All</s-button>
              <s-button variant="tertiary" onClick={() => setOpen(new Set())}>Collapse All</s-button>
            </s-stack>
          </s-stack>
          {data && <s-text color="subdued">{`${t.orders} orders · ${dmy(data.from)} – ${dmy(data.to)}. Deleted, Order Failed, Awaiting Payment and Awaiting V12 Approval items are left out.`}</s-text>}
        </s-stack>
      </s-section>

      {t && (
        <s-section>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <Tile label="Total Orders" value={t.orders.toLocaleString('en-GB')} sub={`${gatewayName(data.gateway)} orders`} />
            <Tile label="Total Line Items" value={t.items.toLocaleString('en-GB')} sub="across all statuses" />
            <Tile label="Total Value" value={gbp(t.valueMinor)} sub="items after discount" />
            <Tile label="Avg Order Value" value={gbp(t.averageMinor)} sub="per order" />
          </s-grid>
        </s-section>
      )}

      {data && groups.length === 0 && (
        <s-section><EmptyState title={searching ? 'Nothing matches the search' : `No ${gatewayName(data.gateway)} orders`} hint={searching ? 'Check the order number or product.' : 'Pick other dates or another payment method.'} /></s-section>
      )}

      {groups.map((g) => (
        <s-section key={g.key}>
          <s-stack direction="block" gap="base">
            <s-clickable onClick={() => toggle(`g:${g.key}`)} accessibilityLabel={`Show or hide ${g.label}`}>
              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-badge tone={g.tone}>{g.label}</s-badge>
                  <s-text color="subdued">{`${g.statuses.length} status type${g.statuses.length === 1 ? '' : 's'}`}</s-text>
                </s-stack>
                <s-text>{`Orders ${g.orders} · Items ${g.items} · ${gbp(g.valueMinor)} · ${pct(g.valueMinor, t.valueMinor)} of value ${isOpen(`g:${g.key}`) ? '▲' : '▼'}`}</s-text>
              </s-stack>
            </s-clickable>
            {isOpen(`g:${g.key}`) && g.statuses.map((s) => {
              const sk = `s:${g.key}:${s.statusId}`;
              return (
                <s-box key={sk} padding="small" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="small">
                    <s-clickable onClick={() => toggle(sk)} accessibilityLabel={`Show or hide ${s.label} orders`}>
                      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                        {s.statusId ? <s-badge tone={statusTone(s.statusId)}>{s.label}</s-badge> : <s-text color="subdued">Not set</s-text>}
                        <s-text>{`Orders ${s.orders} · Items ${s.items} · ${gbp(s.valueMinor)} ${isOpen(sk) ? '▲' : '▼'}`}</s-text>
                      </s-stack>
                    </s-clickable>
                    {isOpen(sk) && (
                      <s-table>
                        <s-table-header-row>
                          <s-table-header listSlot="primary">Order No.</s-table-header>
                          <s-table-header>Date</s-table-header>
                          <s-table-header>Customer</s-table-header>
                          <s-table-header>Items</s-table-header>
                          <s-table-header format="currency">Value</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                          {s.list.map((o) => (
                            <s-table-row key={o.orderId}>
                              <s-table-cell><s-link href={orderUrl(o.orderId)}>{o.name}</s-link></s-table-cell>
                              <s-table-cell>{formatDate(o.createdAt)}</s-table-cell>
                              <s-table-cell>{o.customerName ?? ''}</s-table-cell>
                              <s-table-cell>
                                <s-stack direction="block" gap="small-500">
                                  {o.lines.map((l) => (
                                    <s-text key={l.lineId}>{`${l.quantity} × ${l.title}${l.sku ? ` (${l.sku})` : ''} · ${gbp(l.valueMinor)}${l.expectedDate ? ` · expected ${dmy(l.expectedDate)}` : ''}`}</s-text>
                                  ))}
                                </s-stack>
                              </s-table-cell>
                              <s-table-cell>{gbp(o.valueMinor)}</s-table-cell>
                            </s-table-row>
                          ))}
                        </s-table-body>
                      </s-table>
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        </s-section>
      ))}
    </s-page>
  );
}
