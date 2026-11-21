import { useEffect, useState } from 'preact/hooks';
import { loadOrderDetail } from './orderDetail';
import { expandView } from './orderExpand';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;

// The legacy "expand" view of one order: its lines and totals, read live from Shopify.
export default function ExpandedOrder({ orderId, name, onClose }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadOrderDetail(orderId)
      .then((d) => !cancelled && setView(expandView(d)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, [orderId]);

  return (
    <s-section heading={`Order ${name}`}>
      <s-button slot="secondary-actions" href={orderUrl(orderId)}>Open order</s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Close</s-button>
      {error && <s-banner tone="critical">Could not load this order: {error}</s-banner>}
      {!view && !error && <s-spinner accessibilityLabel={`Loading ${name}`} />}
      {view && (
        <s-stack direction="block" gap="base">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header format="numeric">Unit Price</s-table-header>
              <s-table-header format="numeric">Qty</s-table-header>
              <s-table-header>Expected Date</s-table-header>
              <s-table-header>Delivery Date</s-table-header>
              <s-table-header>Order Status</s-table-header>
              <s-table-header format="numeric">Total Price</s-table-header>
              <s-table-header format="numeric">Offer Discount</s-table-header>
              <s-table-header format="numeric">Coupon Discount</s-table-header>
              <s-table-header format="numeric">Final Price</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {view.rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.product}</s-table-cell>
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{r.unit}</s-table-cell>
                  <s-table-cell>{r.qty}</s-table-cell>
                  <s-table-cell>{r.expected}</s-table-cell>
                  <s-table-cell>{r.delivery}</s-table-cell>
                  <s-table-cell>{r.status}</s-table-cell>
                  <s-table-cell>{r.total}</s-table-cell>
                  <s-table-cell>{r.offer}</s-table-cell>
                  <s-table-cell>{r.coupon}</s-table-cell>
                  <s-table-cell>{r.final}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          <s-stack direction="block" gap="small-200">
            {view.totals.map((t) => (
              <s-stack key={t.label} direction="inline" gap="base" justifyContent="space-between">
                <s-text type="strong">{t.label}</s-text>
                <s-text type="strong">{t.value}</s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-stack>
      )}
    </s-section>
  );
}
