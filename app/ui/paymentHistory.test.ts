import { describe, expect, it } from 'vitest';
import { loadPayments, paymentQueryString } from './paymentHistory';

describe('Payment History calls', () => {
  it('builds the query', () => {
    expect(paymentQueryString({ from: '', to: '', after: '', before: '' })).toBe('');
    expect(paymentQueryString({ from: '2026-11-01', to: '2026-11-30', after: 'e', before: 'b' })).toBe('from=2026-11-01&to=2026-11-30&after=e');
    expect(paymentQueryString({ from: '', to: '', after: '', before: 'b' })).toBe('before=b');
  });
  it('loads a page and explains a failure', async () => {
    const urls: string[] = [];
    const ok = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify({ rows: [], hasNext: false, hasPrevious: false, next: null, previous: null, size: 50 })); }) as typeof fetch;
    expect((await loadPayments({ from: '2026-11-01', to: '', after: '', before: '' }, ok)).ok).toBe(true);
    expect(urls[0]).toContain('/api/payment-history?from=2026-11-01');
    const bad = (async () => new Response(JSON.stringify({ message: 'Shopify could not be read' }), { status: 502 })) as typeof fetch;
    expect(await loadPayments({ from: '', to: '', after: '', before: '' }, bad)).toEqual({ ok: false, message: 'Shopify could not be read' });
  });
});
