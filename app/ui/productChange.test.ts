import { describe, expect, it, vi } from 'vitest';
import { addProduct, choiceLabel, quantityOf, searchProducts } from './productChange';

const reply = (status: number, body: unknown) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;

describe('choiceLabel', () => {
  it('shows product, option, SKU and price, leaving out Default Title', () => {
    expect(choiceLabel({ id: 'v', productTitle: 'Oslo Sideboard', variantTitle: 'Oak', sku: 'HN-OSL', priceMinor: 11999 })).toBe('Oslo Sideboard (Oak) · HN-OSL · £119.99');
    expect(choiceLabel({ id: 'v', productTitle: 'Bergen Table', variantTitle: 'Default Title', sku: '', priceMinor: 5000 })).toBe('Bergen Table · £50.00');
  });
});

describe('quantityOf', () => {
  it('accepts whole numbers from 1 to 24 only', () => {
    expect(quantityOf(' 3 ')).toBe(3);
    expect(quantityOf('24')).toBe(24);
    for (const bad of ['', '0', '25', '1.5', 'two']) expect(quantityOf(bad)).toBeNull();
  });
});

describe('searchProducts', () => {
  it('returns the products found', async () => {
    const f = reply(200, { products: [{ id: 'v', productTitle: 'Oslo', variantTitle: 'Oak', sku: '', priceMinor: 100 }] });
    const r = await searchProducts('5', 'os lo', f);
    expect(r).toMatchObject({ ok: true });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('api/orders/5/product?q=os%20lo');
  });
  it('says so when Shopify cannot be read', async () => {
    expect(await searchProducts('5', 'x', reply(502, { error: 'shopify_unavailable' }))).toEqual({ ok: false, message: 'Shopify could not be read just now. Try again shortly.' });
  });
});

describe('addProduct', () => {
  it('posts the product and returns the history text', async () => {
    const f = reply(200, { ok: true, from: 'Old x 1 = £1.00', to: 'New x 2 = £4.00' });
    expect(await addProduct('5', { variantId: 'gid://shopify/ProductVariant/9', quantity: 2, replaceLineItemId: null }, f)).toEqual({ ok: true, from: 'Old x 1 = £1.00', to: 'New x 2 = £4.00' });
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual({ variantId: 'gid://shopify/ProductVariant/9', quantity: 2, replaceLineItemId: null });
  });
  it('explains a refusal in plain words', async () => {
    expect(await addProduct('5', { variantId: 'v', quantity: 1, replaceLineItemId: null }, reply(403, { error: 'staff_not_verified' }))).toEqual({ ok: false, message: 'Only a verified staff member can change the products on an order.' });
    expect(await addProduct('5', { variantId: 'v', quantity: 1, replaceLineItemId: null }, reply(422, { error: 'shopify_rejected', message: 'Variant not found' }))).toEqual({ ok: false, message: 'Shopify did not accept the change: Variant not found' });
  });
});
