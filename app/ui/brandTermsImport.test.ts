import { describe, expect, it, vi } from 'vitest';
import { filterBrands, importBrandTerms, importSummary, pageOf, parseBrandTermsCsv, splitCsv } from './brandTermsImport';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('splitCsv', () => {
  it('handles quotes, doubled quotes, CRLF and a byte-order mark', () => {
    expect(splitCsv('﻿Brand,Terms\r\n"Duke, Beds",Credit\r\n"A ""B""",Pro-forma\r\n')).toEqual([['Brand', 'Terms'], ['Duke, Beds', 'Credit'], ['A "B"', 'Pro-forma']]);
  });
  it('reads semicolon files (Excel in some countries)', () => {
    expect(splitCsv('Brand;Terms\nActona;Credit')).toEqual([['Brand', 'Terms'], ['Actona', 'Credit']]);
  });
  it('keeps a last row that has no line break', () => {
    expect(splitCsv('Brand,Terms\nA,Credit')).toEqual([['Brand', 'Terms'], ['A', 'Credit']]);
  });
});

describe('parseBrandTermsCsv', () => {
  it('numbers rows like the spreadsheet (heading is line 1) and skips blank lines', () => {
    const r = parseBrandTermsCsv('Brand,Terms\nActona,Credit\n,\nDuke Beds,Pro-forma\n');
    expect(r).toEqual({ ok: true, rows: [{ line: 2, brand: 'Actona', terms: 'Credit' }, { line: 4, brand: 'Duke Beds', terms: 'Pro-forma' }] });
  });
  it('finds the columns by heading in any order and case, and ignores extra columns', () => {
    expect(parseBrandTermsCsv('Notes,TERMS,brand\nx,Credit,Actona')).toEqual({ ok: true, rows: [{ line: 2, brand: 'Actona', terms: 'Credit' }] });
  });
  it('keeps a brand with blank terms so the server can leave it alone', () => {
    expect(parseBrandTermsCsv('Brand,Terms\nActona,')).toEqual({ ok: true, rows: [{ line: 2, brand: 'Actona', terms: '' }] });
  });
  it('explains a missing heading, an empty file and a file that is too long', () => {
    expect(parseBrandTermsCsv('Vendor,Type\nA,B')).toMatchObject({ ok: false, message: expect.stringContaining('headings Brand and Terms') });
    expect(parseBrandTermsCsv('Brand,Terms\n')).toEqual({ ok: false, message: 'The file has no brands in it.' });
    const long = 'Brand,Terms\n' + Array.from({ length: 5001 }, (_, i) => `B${i},Credit`).join('\n');
    expect(parseBrandTermsCsv(long)).toMatchObject({ ok: false, message: expect.stringContaining('at most 5000') });
  });
});

describe('importBrandTerms', () => {
  it('posts the rows and returns the result', async () => {
    const result = { saved: 2, cleared: 0, unchanged: 0, rejected: [], rejectedCount: 0 };
    const fetchFn = vi.fn(reply(200, result));
    const rows = [{ line: 2, brand: 'A', terms: 'Credit' }];
    expect(await importBrandTerms(rows, fetchFn as never)).toEqual({ ok: true, result });
    expect(fetchFn).toHaveBeenCalledWith('/api/brand-terms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) });
  });
  it('explains refusals and network failures', async () => {
    expect(await importBrandTerms([], reply(403, { error: 'staff_not_verified' }) as never)).toEqual({ ok: false, message: 'Only a verified staff member can change brand terms.' });
    expect(await importBrandTerms([], reply(400, { error: 'too_many_rows' }) as never)).toEqual({ ok: false, message: 'Please import at most 5000 brands at a time.' });
    expect(await importBrandTerms([], reply(500, {}) as never)).toEqual({ ok: false, message: 'The server answered with status 500.' });
    expect(await importBrandTerms([], (async () => { throw new Error('offline'); }) as never)).toEqual({ ok: false, message: 'offline' });
  });
});

describe('importSummary', () => {
  it('mentions only what happened', () => {
    expect(importSummary({ saved: 3, cleared: 0, unchanged: 0, rejected: [], rejectedCount: 0 })).toBe('Import finished: 3 saved.');
    expect(importSummary({ saved: 3, cleared: 1, unchanged: 2, rejected: [], rejectedCount: 4 })).toBe('Import finished: 3 saved, 1 cleared, 2 left as they were (blank terms), 4 skipped.');
  });
});

describe('searching and paging', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ brand: i === 7 ? 'Duke Beds' : `Brand ${i}`, terms: null }));
  it('filters by words in any case', () => {
    expect(filterBrands(rows, ' duke ').map((r) => r.brand)).toEqual(['Duke Beds']);
    expect(filterBrands(rows, '')).toHaveLength(120);
    expect(filterBrands(rows, 'zzz')).toEqual([]);
  });
  it('pages 50 at a time and keeps the page in range', () => {
    expect(pageOf(rows, 1)).toMatchObject({ page: 1, pageCount: 3 });
    expect(pageOf(rows, 3).items).toHaveLength(20);
    expect(pageOf(rows, 9).page).toBe(3);
    expect(pageOf(rows, 0).page).toBe(1);
    expect(pageOf([], 1)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});
