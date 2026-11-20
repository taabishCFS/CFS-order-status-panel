import { useEffect, useState } from 'preact/hooks';
import { loadOlderHistory } from '../../cfs-order-status/src/archive';
import { describeEntry, scopeLabel } from '../../cfs-order-status/src/historyText';
import { deliveryOf, expectedOf } from '../../cfs-order-status/src/lineInfo';
import { labelFor } from '../../cfs-order-status/src/statuses';
import { callBackend } from './backend';
import DeliverySection from './DeliverySection.jsx';
import ExpectedDateSection from './ExpectedDateSection.jsx';
import NotesSection from './NotesSection.jsx';
import StatusSection from './StatusSection.jsx';
import { useOrderDetail } from './useOrderDetail';
import { useWriter } from './useWriter';

const money = (m) => (m ? `${m.currency} ${m.amount}` : 'Unavailable');
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : 'Not set');
const when = (iso) => new Date(iso).toLocaleString('en-GB');
const DELIVERY = { confirmed: 'Confirmed', declined: 'Declined' };

export default function OrderDetailPage({ id }) {
  const orderId = `gid://shopify/Order/${id}`;
  const { detail, customer, loading, loadFailed, notice, setNotice, refresh } = useOrderDetail(orderId);
  const [older, setOlder] = useState({ entries: [], cursor: null, hasNext: true, loading: false, error: null });
  const [picked, setPicked] = useState([]);
  const [showHistory, setShowHistory] = useState(true);
  const [visible, setVisible] = useState(5);
  // Staff member verified by the backend from the session token; null when unavailable.
  const [verified, setVerified] = useState(null);
  useEffect(() => {
    callBackend('api/whoami').then((r) => setVerified(r?.staff?.name ? r.staff : null)).catch(() => setVerified(null));
  }, []);
  const resetOlder = () => setOlder({ entries: [], cursor: null, hasNext: true, loading: false, error: null });
  const writer = useWriter({
    orderId,
    detail,
    refresh,
    setNotice,
    afterSave: () => {
      resetOlder();
      setPicked([]);
    },
  });
  const toggle = (lineId, on) => setPicked((p) => (on ? [...p, lineId] : p.filter((x) => x !== lineId)));

  if (!detail) {
    return (
      <s-page heading="Order">
        <s-link href="/">← Orders by Brand</s-link>
        {notice && <s-banner tone={notice.tone} heading="Could not load this order">{notice.text}</s-banner>}
        {loading && <s-spinner accessibilityLabel="Loading order" />}
      </s-page>
    );
  }

  const { state, lines } = detail;
  const total = state.totalEntries ?? state.history.length;
  const shownIds = new Set([...state.history, ...older.entries].map((h) => h.id));
  const canShowOlder = total > state.history.length && older.hasNext;
  const titleOf = (target) => {
    const l = lines.find((x) => x.id === target);
    return l ? `${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ''}` : 'Removed line';
  };

  async function showOlder() {
    setOlder((o) => ({ ...o, loading: true, error: null }));
    try {
      const page = await loadOlderHistory(orderId, { after: older.cursor });
      setOlder((o) => ({
        entries: [...o.entries, ...page.entries.filter((e) => !shownIds.has(e.id))],
        cursor: page.endCursor,
        hasNext: page.hasNextPage,
        loading: false,
        error: null,
      }));
    } catch (e) {
      setOlder((o) => ({ ...o, loading: false, error: e.message }));
    }
  }

  const reload = () => {
    resetOlder();
    return refresh();
  };

  return (
    <s-page heading={detail.name}>
      <s-link href="/">← Orders by Brand</s-link>
      <s-button slot="primary-action" href={`shopify://admin/orders/${id}`}>Open in Shopify</s-button>
      <s-button slot="secondary-actions" onClick={reload} loading={loading || undefined}>Refresh</s-button>

      {notice && (
        <s-banner tone={notice.tone}>
          {notice.text}
          {notice.refresh && <s-button slot="secondary-actions" onClick={reload}>Refresh</s-button>}
        </s-banner>
      )}

      <s-section heading="Order">
        <s-stack direction="block" gap="small">
          <s-text>Placed {when(detail.createdAt)}</s-text>
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text type="strong">Order status:</s-text>
            <s-badge>{state.order ? labelFor(state.order.statusId) : 'Not set'}</s-badge>
          </s-stack>
          {state.instructions && <s-text>Instructions: {state.instructions.text}</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Customer">
        {!customer && <s-text>Loading…</s-text>}
        {customer?.restricted && <s-text>Customer details restricted.</s-text>}
        {customer && !customer.restricted && (
          <s-stack direction="inline" gap="large">
            <s-stack direction="block" gap="small-300">
              <s-text type="strong">Shipping</s-text>
              {customer.shipping.map((l, i) => <s-text key={i}>{l}</s-text>)}
              {customer.email && <s-text>{customer.email}</s-text>}
            </s-stack>
            <s-stack direction="block" gap="small-300">
              <s-text type="strong">Billing</s-text>
              {customer.billing.map((l, i) => <s-text key={i}>{l}</s-text>)}
            </s-stack>
          </s-stack>
        )}
      </s-section>

      <s-section heading="Saving as">
        {verified && <s-text>Verified as {verified.name}</s-text>}
        {writer.staff
          ? <s-text>{writer.staff.name}</s-text>
          : writer.staff === null && (
            <s-text-field label="Your name (shown as unverified in the history)" value={writer.name} onInput={(e) => writer.setName(e.currentTarget.value)} />
          )}
      </s-section>

      <StatusSection orderId={orderId} detail={detail} picked={picked} loading={loading} loadFailed={loadFailed} writer={writer} setNotice={setNotice} />

      <s-section heading="Items" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header>Tick</s-table-header>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>SKU</s-table-header>
            <s-table-header format="numeric">Qty</s-table-header>
            <s-table-header format="numeric">Unit price</s-table-header>
            <s-table-header>Expected date</s-table-header>
            <s-table-header>Delivery</s-table-header>
            <s-table-header>Line status</s-table-header>
            <s-table-header format="numeric">Discount</s-table-header>
            <s-table-header format="numeric">Final price</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {lines.map((l) => (
              <s-table-row key={l.id}>
                <s-table-cell>
                  <s-checkbox label={`Select ${l.title}`} labelAccessibilityVisibility="exclusive" checked={picked.includes(l.id)} onChange={(e) => toggle(l.id, e.currentTarget.checked)} />
                </s-table-cell>
                <s-table-cell>{l.title}{l.variantTitle ? ` (${l.variantTitle})` : ''}</s-table-cell>
                <s-table-cell>{l.sku || 'Unavailable'}</s-table-cell>
                <s-table-cell>{l.quantity}</s-table-cell>
                <s-table-cell>{money(l.unit)}</s-table-cell>
                <s-table-cell>{dmy(expectedOf(state, l.id))}</s-table-cell>
                <s-table-cell>{DELIVERY[deliveryOf(state, l.id)] || 'Not set'}</s-table-cell>
                <s-table-cell>{state.lines[l.id] ? labelFor(state.lines[l.id].statusId) : 'Not set'}</s-table-cell>
                <s-table-cell>{money(l.discount)}</s-table-cell>
                <s-table-cell>{money(l.final)}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <ExpectedDateSection picked={picked} writer={writer} />
      <DeliverySection picked={picked} writer={writer} />
      <NotesSection key={detail.state.instructions?.at ?? 'none'} detail={detail} writer={writer} />

      <s-section heading="Totals">
        <s-stack direction="block" gap="small-300">
          <s-text>Subtotal: {money(detail.totals.subtotal)}</s-text>
          <s-text>Discounts: {money(detail.totals.discounts)}</s-text>
          <s-text>Shipping: {money(detail.totals.shipping)}</s-text>
          <s-text type="strong">Total: {money(detail.totals.total)}</s-text>
        </s-stack>
      </s-section>

      <s-section heading={`History (${total})`}>
        <s-button onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'Show history'}</s-button>
        {showHistory && <>
        <s-stack direction="block" gap="small">
          {state.history.length === 0 && <s-text>No changes yet.</s-text>}
          {[...[...state.history].reverse(), ...older.entries].slice(0, visible).map((h) => (
            <s-box key={h.id} padding="small" border="base" borderRadius="base">
              <s-stack direction="block" gap="small-300">
                <s-text type="strong">
                  {when(h.at)} · {h.by.name}{h.by.source === 'self-declared' ? ' (unverified)' : ''} · {scopeLabel(h.scope)}
                </s-text>
                {describeEntry(h, titleOf).map((text, i) => <s-text key={i}>{text}</s-text>)}
              </s-stack>
            </s-box>
          ))}
          {older.error && <s-banner tone="warning">Older history could not be loaded: {older.error}</s-banner>}
          {visible < state.history.length + older.entries.length && <s-button onClick={() => setVisible((v) => v + 10)}>Show 10 more</s-button>}
          {visible >= state.history.length + older.entries.length && canShowOlder && <s-button loading={older.loading || undefined} onClick={showOlder}>Show older history</s-button>}
        </s-stack>
        </>}
      </s-section>
    </s-page>
  );
}
