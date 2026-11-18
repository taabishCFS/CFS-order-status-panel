import { useCallback, useEffect, useState } from 'preact/hooks';
import { currentLines } from './lines';
import { emptyState, reconcileLines } from './state';
import { loadState } from './store';

const LINES_QUERY = `#graphql
  query CfsOrderLines($id: ID!) {
    order(id: $id) {
      lineItems(first: 100) { nodes { id title variantTitle quantity currentQuantity } }
    }
  }`;

async function loadLines(orderId) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({ query: LINES_QUERY, variables: { id: orderId } }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return currentLines(body.data.order.lineItems.nodes);
}

export const lineText = (l) => `${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ''} × ${l.quantity}`;

// Loads the order's lines and saved CFS status. Shared by the block and the update dialog.
export function useOrderStatus(orderId) {
  const [lines, setLines] = useState([]);
  const [state, setState] = useState(emptyState());
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null); // { tone, text, refresh? }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ state: s, digest: d }, ls] = await Promise.all([loadState(orderId), loadLines(orderId)]);
      setState(s);
      setDigest(d);
      setLines(ls);
      setNotice(null);
    } catch (e) {
      setNotice({ tone: 'critical', text: e.message });
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const { removed } = reconcileLines(state, lines.map((l) => l.id));
  return { lines, state, digest, loading, notice, setNotice, refresh, removed };
}
