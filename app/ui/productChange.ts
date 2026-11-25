// Add New Product: search the shop's products, then add one to the order (or swap it for a ticked line).
// Calls return { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface ProductChoice {
  id: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  priceMinor: number;
}

export const MAX_QTY = 24;

/** "Oslo Sideboard (Oak) · HN-OSL · £119.99" for the picker. */
export function choiceLabel(c: ProductChoice): string {
  const option = c.variantTitle && c.variantTitle !== 'Default Title' ? ` (${c.variantTitle})` : '';
  return `${c.productTitle}${option}${c.sku ? ` · ${c.sku}` : ''} · £${(c.priceMinor / 100).toFixed(2)}`;
}

/** The quantity as a whole number from 1 to 24, or null. */
export function quantityOf(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_QTY ? n : null;
}

function problem(status: number, body: { error?: string; message?: string } | null): string {
  switch (body?.error) {
    case 'staff_not_verified': return 'Only a verified staff member can change the products on an order.';
    case 'bad_product': return 'Choose a product from the list.';
    case 'bad_quantity': return `Enter a quantity from 1 to ${MAX_QTY}.`;
    case 'shopify_unavailable': return 'Shopify could not be read just now. Try again shortly.';
    case 'shopify_rejected': return `Shopify did not accept the change: ${body.message ?? 'no reason given'}`;
    default: return `The server answered with status ${status}.`;
  }
}

const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

export async function searchProducts(orderNumber: string, text: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; products: ProductChoice[] } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/product?q=${encodeURIComponent(text.trim())}`, undefined, fetchFn);
    const body = res.body as { products?: ProductChoice[]; error?: string; message?: string } | null;
    return res.ok && body?.products ? { ok: true, products: body.products } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function addProduct(
  orderNumber: string,
  input: { variantId: string; quantity: number; replaceLineItemId: string | null },
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; from: string | null; to: string } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult(`api/orders/${orderNumber}/product`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, fetchFn);
    const body = res.body as { ok?: boolean; from?: string | null; to?: string; error?: string; message?: string } | null;
    return res.ok && body?.ok && body.to ? { ok: true, from: body.from ?? null, to: body.to } : { ok: false, message: problem(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}
