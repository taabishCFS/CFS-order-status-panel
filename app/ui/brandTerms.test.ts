import { describe, expect, it, vi } from 'vitest';
import { loadBrandTerms, saveBrandTerms, termsFromValue } from './brandTerms';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('loadBrandTerms', () => {
  it('returns the brands', async () => {
    const brands = [{ brand: 'Actona', terms: 'credit' }];
    expect(await loadBrandTerms(reply(200, { brands }) as never)).toEqual({ ok: true, brands });
  });
  it('explains a failure in words and does not throw on a network error', async () => {
    expect(await loadBrandTerms(reply(500, {}) as never)).toEqual({ ok: false, message: 'The server answered with status 500.' });
    expect(await loadBrandTerms((async () => { throw new Error('offline'); }) as never)).toEqual({ ok: false, message: 'offline' });
  });
});

describe('saveBrandTerms', () => {
  it('posts the brand and terms', async () => {
    const fetchFn = vi.fn(reply(200, { ok: true }));
    expect(await saveBrandTerms('Actona', 'proforma', fetchFn as never)).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith('/api/brand-terms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand: 'Actona', terms: 'proforma' }) });
  });
  it('explains a refusal', async () => {
    expect(await saveBrandTerms('A', null, reply(403, { error: 'staff_not_verified' }) as never)).toEqual({ ok: false, message: 'Only a verified staff member can change brand terms.' });
  });
});

describe('termsFromValue', () => {
  it('maps the select values', () => {
    expect(termsFromValue('credit')).toBe('credit');
    expect(termsFromValue('proforma')).toBe('proforma');
    expect(termsFromValue('')).toBeNull();
    expect(termsFromValue('x')).toBeNull();
  });
});
