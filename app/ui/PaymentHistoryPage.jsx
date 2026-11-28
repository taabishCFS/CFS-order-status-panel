import { useCallback, useEffect, useRef, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import { formatMoney } from './orderList';
import { loadPayments } from './paymentHistory';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const money = (r) => (r.amountMinor < 0 ? `-${formatMoney(-r.amountMinor, r.currency)}` : formatMoney(r.amountMinor, r.currency));
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// Payment History (old Order menu, "Payment/Refund"): every payment and refund on the shop, newest first, read live from Shopify.
export default function PaymentHistoryPage() {
  const [query, setQuery] = useState({ from: '', to: '', after: '', before: '' });
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pressed, setPressed] = useState(null); // 'refresh' | 'go' | 'next' | 'previous'
  const [page, setPage] = useState(1);

  // Only the newest request may fill the page.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    const res = await loadPayments(query);
    if (mine !== latest.current) return;
    setLoading(false);
    setPressed(null);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const busy = (key) => (loading && pressed === key) || undefined;
  const badRange = draft.from && draft.to && draft.from > draft.to;
  const go = () => { if (badRange) return; setPressed('go'); setPage(1); setQuery({ from: draft.from, to: draft.to, after: '', before: '' }); };
  const reset = () => { setDraft({ from: '', to: '' }); setPage(1); setQuery({ from: '', to: '', after: '', before: '' }); };
  const next = () => { setPressed('next'); setPage((p) => p + 1); setQuery((q) => ({ ...q, after: data.next, before: '' })); };
  const previous = () => { setPressed('previous'); setPage((p) => Math.max(1, p - 1)); setQuery((q) => ({ ...q, after: '', before: data.previous })); };

  const rows = data?.rows ?? [];
  const filtered = Boolean(query.from || query.to);
  const first = rows.length ? (page - 1) * (data?.size ?? 50) + 1 : 0;

  return (
    <s-page heading="Payment History">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/balance-pending">Balance Pending</s-button>
      <s-button slot="primary-action" onClick={() => { setPressed('refresh'); load(); }} loading={busy('refresh')}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the payments">{error}</s-banner>}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button onClick={go} loading={busy('go')} disabled={badRange || undefined}>GO</s-button>
            {filtered && <s-button onClick={reset}>Reset</s-button>}
          </s-stack>
          {badRange && <s-text tone="critical">The From date is after the To date.</s-text>}
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? (rows.length ? `${first} - ${first + rows.length - 1}` : '0') : 'Loading...'}</s-text>
            <s-stack direction="inline" gap="small">
              <s-button disabled={!data?.hasPrevious || undefined} loading={busy('previous')} onClick={previous}>Previous</s-button>
              <s-button disabled={!data?.hasNext || undefined} loading={busy('next')} onClick={next}>Next</s-button>
            </s-stack>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title={filtered ? 'No payments in these dates' : 'No payments yet'} hint={filtered ? 'Change the dates or press Reset.' : 'Payments and refunds will appear here.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order No.</s-table-header>
              <s-table-header>Reference</s-table-header>
              <s-table-header>Tx Type</s-table-header>
              <s-table-header format="numeric">Amount</s-table-header>
              <s-table-header>Pay Type</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Payer Email</s-table-header>
              <s-table-header>Payment Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.orderId ? <s-link href={orderUrl(r.orderId)} tone="critical">{r.orderName}</s-link> : <s-text tone="neutral" color="subdued">Order hidden by Shopify</s-text>}</s-table-cell>
                  <s-table-cell>{r.reference}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-badge tone={r.type === 'Refund' ? 'critical' : 'success'}>{r.type}</s-badge>
                      {r.test && <s-badge>Test</s-badge>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{r.type === 'Refund' ? <s-text tone="critical">{money(r)}</s-text> : money(r)}</s-table-cell>
                  <s-table-cell>{r.payType}</s-table-cell>
                  <s-table-cell>{r.customer.toUpperCase()}</s-table-cell>
                  <s-table-cell>{r.email}</s-table-cell>
                  <s-table-cell>{when(r.date)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
