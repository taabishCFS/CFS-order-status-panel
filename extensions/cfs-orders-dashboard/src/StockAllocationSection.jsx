import { useCallback, useEffect, useState } from 'preact/hooks';
import { allocateStock, countGiven, givenToLine, loadOrderStock, mostToGive, removeAllocation, wholeQty } from './stockAllocation';

const when = (iso) => new Date(iso).toLocaleString('en-GB');

// Allocate from stock: for each item on the order, free stock with the same product code can be given to it instead of buying again.
// Giving stock does not change the item's status. Removing it puts the quantity back.
export default function StockAllocationSection({ id, lines, verified, kind = 'free' }) {
  const container = kind === 'container';
  const noun = container ? 'container stock' : 'free stock';
  const [data, setData] = useState(null); // { allocations, options } once loaded
  const [message, setMessage] = useState(null); // { tone, text }
  const [qtys, setQtys] = useState({}); // `${lineId}:${stockId}` -> typed quantity
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const r = await loadOrderStock(id, fetch, kind);
    if (r.ok) setData(r.data);
    else setMessage({ tone: 'warning', text: `Stock could not be loaded: ${r.message}` });
  }, [id, kind]);
  useEffect(() => { load(); }, [load]);

  const keyOf = (lineId, stockId) => `${lineId}:${stockId}`;

  async function give(line, option) {
    const k = keyOf(line.id, option.id);
    const qty = wholeQty(qtys[k] ?? '1');
    if (!qty) { setMessage({ tone: 'critical', text: 'Enter a whole number of 1 or more.' }); return; }
    setBusy(k);
    setMessage(null);
    const res = await allocateStock(id, line.id, option.id, qty, fetch, kind);
    setBusy(null);
    if (!res.ok) { setMessage({ tone: 'critical', text: res.message }); load(); return; }
    setMessage({ tone: 'success', text: `Gave ${qty} x ${option.productCode} to ${line.title}.` });
    setQtys((q) => { const { [k]: _gone, ...rest } = q; return rest; });
    load();
  }

  async function take(line, given) {
    setBusy(given.id);
    setMessage(null);
    const res = await removeAllocation(id, given.id, fetch, kind);
    setBusy(null);
    if (!res.ok) { setMessage({ tone: 'critical', text: res.message }); load(); return; }
    setMessage({ tone: 'success', text: `Took back ${given.qty} x ${given.productCode} from ${line.title}. It is back in ${noun}.` });
    load();
  }

  const shown = data ? lines.filter((l) => (data.options[l.id]?.length ?? 0) > 0 || givenToLine(data.allocations, l.id).length > 0) : [];

  // Most orders have no container stock: do not show an empty box for it.
  if (container && data && shown.length === 0 && !message) return null;

  return (
    <s-section heading={container ? 'Allocate from containers' : 'Allocate from stock'}>
      <s-stack direction="block" gap="base">
        {!verified && <s-banner tone="warning">Giving out stock needs a verified Shopify staff sign-in.</s-banner>}
        {message && <s-banner tone={message.tone} dismissible onDismiss={() => setMessage(null)}>{message.text}</s-banner>}
        {!data && !message && <s-text>Loading…</s-text>}
        {data && shown.length === 0 && <s-text color="subdued">{container ? 'No container stock matches the items on this order. Containers are kept on the Containers page.' : 'No free stock matches the items on this order. Free stock is kept on the Stock page.'}</s-text>}
        {data && shown.map((line) => {
          const given = givenToLine(data.allocations, line.id);
          const already = countGiven(data.allocations, line.id);
          return (
            <s-box key={line.id} padding="small" border="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text type="strong">{line.title}{line.variantTitle ? ` (${line.variantTitle})` : ''}</s-text>
                <s-text color="subdued">Ordered {line.quantity} · from {container ? 'containers' : 'stock'} {already}{line.sku ? ` · code ${line.sku}` : ''}</s-text>
                {given.map((g) => (
                  <s-stack key={g.id} direction="inline" gap="base" alignItems="center">
                    <s-text>{g.qty} x {g.warehouseCode}{g.containerNo ? ` (container ${g.containerNo})` : ''}{g.unitCost ? ` (£${g.unitCost} each)` : ''} · {g.addedByName ?? 'staff'}, {when(g.createdAt)}</s-text>
                    <s-button tone="critical" disabled={!verified || busy !== null || undefined} loading={busy === g.id || undefined} onClick={() => take(line, g)}>Take back</s-button>
                  </s-stack>
                ))}
                {(data.options[line.id] ?? []).map((o) => {
                  const k = keyOf(line.id, o.id);
                  const most = mostToGive(o, line.quantity, already);
                  return (
                    <s-stack key={o.id} direction="inline" gap="base" alignItems="end">
                      <s-text>{o.brand} · {o.warehouseCode}{o.containerNo ? ` · container ${o.containerNo}` : ''} · {o.qty} {container ? 'left' : 'in stock'}{o.expectedDate ? (o.onWater ? ` · on the water, due ${o.expectedDate}` : ` · arrived ${o.expectedDate}`) : ''}{o.cost ? ` · £${o.cost} each` : ''}</s-text>
                      {most > 0 ? (
                        <>
                          <s-text-field label="How many" value={qtys[k] ?? '1'} onInput={(e) => setQtys((q) => ({ ...q, [k]: e.currentTarget.value }))} />
                          <s-button variant="primary" disabled={!verified || busy !== null || undefined} loading={busy === k || undefined} onClick={() => give(line, o)}>Give to this item</s-button>
                        </>
                      ) : (
                        <s-text color="subdued">This item already has all it needs.</s-text>
                      )}
                    </s-stack>
                  );
                })}
              </s-stack>
            </s-box>
          );
        })}
      </s-stack>
    </s-section>
  );
}
