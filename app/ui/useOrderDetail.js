import { useCallback, useEffect, useState } from 'react';
import { loadCustomerBlock, loadOrderDetail } from './orderDetail';

// Loads one order's live Shopify data and its saved CFS record. The customer block loads
// separately so a protected-data refusal never stops the page.
export function useOrderDetail(orderId) {
  const [detail, setDetail] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text, refresh? }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([loadOrderDetail(orderId), loadCustomerBlock(orderId)]);
      setDetail(d);
      setCustomer(c);
      setLoadFailed(false);
      setNotice(null);
    } catch (e) {
      setLoadFailed(true);
      setNotice({ tone: 'critical', text: e.message });
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { detail, customer, loading, loadFailed, notice, setNotice, refresh };
}
