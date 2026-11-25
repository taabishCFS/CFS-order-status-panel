import { useState } from 'react';
import { applyProductChange } from '../../extensions/cfs-order-status/src/detailState';
import { addProduct, choiceLabel, quantityOf, searchProducts } from './productChange';

// Add New Product: find a product, give a quantity and add it to the Shopify order. If exactly one item is ticked
// in the Items table, it is swapped for the new product. Shopify works out the new total and balance (the customer
// pays the difference, as on an order edit). Recorded in the history.
export default function ProductSection({ id, lines, picked, writer, verified, reload, setNotice }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState(null); // null before a search, else [{ id, ... }]
  const [choice, setChoice] = useState('');
  const [qty, setQty] = useState('1');
  const [message, setMessage] = useState(null); // { tone, text }
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const replacing = picked.length === 1 ? lines.find((l) => l.id === picked[0]) : null;

  async function search() {
    if (!text.trim()) return;
    setSearching(true);
    setMessage(null);
    const res = await searchProducts(id, text);
    setSearching(false);
    if (!res.ok) { setMessage({ tone: 'critical', text: res.message }); return; }
    setFound(res.products);
    setChoice(res.products[0]?.id ?? '');
    if (res.products.length === 0) setMessage({ tone: 'info', text: 'No products found. Try part of the name or the SKU.' });
  }

  async function add() {
    const quantity = quantityOf(qty);
    if (!choice) { setMessage({ tone: 'critical', text: 'Choose a product from the list.' }); return; }
    if (quantity === null) { setMessage({ tone: 'critical', text: 'Enter a quantity from 1 to 24.' }); return; }
    if (picked.length > 1) { setMessage({ tone: 'critical', text: 'Select a single item to replace, or untick them all to add a new line.' }); return; }
    setBusy(true);
    setMessage(null);
    const res = await addProduct(id, { variantId: choice, quantity, replaceLineItemId: replacing ? replacing.id : null });
    if (!res.ok) { setBusy(false); setMessage({ tone: 'critical', text: res.message }); return; }
    // Shopify has the change. Record it; if that fails the product is still on the order.
    const recorded = await writer.write((state, meta) => applyProductChange(state, { from: res.from, to: res.to, ...meta }));
    if (recorded) await reload();
    setBusy(false);
    setFound(null);
    setChoice('');
    setText('');
    setQty('1');
    setMessage(recorded
      ? { tone: 'success', text: `${res.from ? 'Product replaced' : 'Product added'}: ${res.to}. The order total and balance now include it.` }
      : { tone: 'warning', text: `The product was changed on the order, but the history entry was not recorded${writer.lastError.current ? `: ${writer.lastError.current}` : ''}.` });
  }

  return (
    <s-section heading="Add New Product">
      <s-stack direction="block" gap="base">
        {!verified && <s-banner tone="warning">Changing products needs a verified Shopify staff sign-in.</s-banner>}
        {message && <s-banner tone={message.tone} dismissible onDismiss={() => setMessage(null)}>{message.text}</s-banner>}
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field label="Search products (name or SKU)" value={text} onInput={(e) => setText(e.currentTarget.value)} />
          <s-button loading={searching || undefined} disabled={!text.trim() || undefined} onClick={search}>Search</s-button>
        </s-stack>
        {found && found.length > 0 && (
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Product" value={choice} onChange={(e) => setChoice(e.currentTarget.value)}>
              {found.map((c) => <s-option key={c.id} value={c.id}>{choiceLabel(c)}</s-option>)}
            </s-select>
            <s-text-field label="Qty" value={qty} onInput={(e) => setQty(e.currentTarget.value)} />
          </s-stack>
        )}
        {found && found.length > 0 && (
          <s-text color="subdued">
            {replacing ? `Will replace the ticked item: ${replacing.title}${replacing.variantTitle ? ` (${replacing.variantTitle})` : ''}.` : 'Will be added as a new line. To swap an item instead, tick that one item in the Items table first.'}
          </s-text>
        )}
        {found && found.length > 0 && (
          <s-button variant="primary" disabled={!verified || !choice || busy || undefined} loading={busy || undefined} onClick={add}>{replacing ? 'Replace with this product' : 'Add this product'}</s-button>
        )}
        <s-text color="subdued">The product is added to the Shopify order at its current price and the customer is charged the difference, as when an order is edited in Shopify. The customer is not emailed.</s-text>
      </s-stack>
    </s-section>
  );
}
