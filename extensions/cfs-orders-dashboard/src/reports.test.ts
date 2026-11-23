import { describe, expect, it, vi } from 'vitest';
import { REPORTS, loadReportLink, rangeProblem } from './reports';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('REPORTS', () => {
  it('lists the two reports and which one needs dates', () => {
    expect(REPORTS.map((r) => [r.kind, r.needsDates, r.needsTerms])).toEqual([['xero', true, false], ['outstanding', true, true], ['delivery', false, false]]);
  });
});

describe('rangeProblem', () => {
  it('asks for both dates', () => {
    expect(rangeProblem('', '2026-11-01')).toBe('Select Start & End Date.');
    expect(rangeProblem('2026-11-01', '')).toBe('Select Start & End Date.');
  });
  it('refuses a reversed or over-long range', () => {
    expect(rangeProblem('2026-11-05', '2026-11-01')).toMatch(/start must not be after/);
    expect(rangeProblem('2025-01-01', '2026-11-01')).toMatch(/longer than a year/);
  });
  it('accepts a normal range and a single day', () => {
    expect(rangeProblem('2026-11-01', '2026-11-30')).toBeNull();
    expect(rangeProblem('2026-11-01', '2026-11-01')).toBeNull();
  });
});

describe('loadReportLink', () => {
  it('asks for the Xero link with the dates and returns the link', async () => {
    const fetchFn = vi.fn(reply(200, { url: 'https://x/exports/report?t=abc', filename: 'Xero_Report-2026-11-01_to_2026-11-30.csv' }));
    const res = await loadReportLink('xero', { from: '2026-11-01', to: '2026-11-30' }, fetchFn as never);
    expect(fetchFn).toHaveBeenCalledWith('/api/report-link?kind=xero&from=2026-11-01&to=2026-11-30', undefined);
    expect(res).toEqual({ ok: true, data: { url: 'https://x/exports/report?t=abc', filename: 'Xero_Report-2026-11-01_to_2026-11-30.csv' } });
  });
  it('asks for the delivery link without dates', async () => {
    const fetchFn = vi.fn(reply(200, { url: 'u', filename: 'delivery_report.csv' }));
    await loadReportLink('delivery', null, fetchFn as never);
    expect(fetchFn).toHaveBeenCalledWith('/api/report-link?kind=delivery', undefined);
  });
  it('adds the pay terms to the outstanding link', async () => {
    const fetchFn = vi.fn(reply(200, { url: 'u', filename: 'f.csv' }));
    await loadReportLink('outstanding', { from: '2026-11-01', to: '2026-11-30' }, fetchFn as never, 'proforma');
    expect(fetchFn).toHaveBeenCalledWith('/api/report-link?kind=outstanding&from=2026-11-01&to=2026-11-30&terms=proforma', undefined);
    const bad = await loadReportLink('outstanding', { from: 'a', to: 'b' }, reply(400, { error: 'bad_terms' }) as never);
    expect(bad).toEqual({ ok: false, message: 'Choose Credit or Pro-forma.' });
  });
  it('explains a refusal in words', async () => {
    expect(await loadReportLink('xero', { from: 'a', to: 'b' }, reply(403, { error: 'staff_not_verified' }) as never)).toEqual({ ok: false, message: 'Only a verified staff member can download reports.' });
    const bad = await loadReportLink('xero', { from: 'a', to: 'b' }, reply(400, { error: 'bad_dates' }) as never);
    expect(bad.ok === false && bad.message).toMatch(/start and end date/);
    const odd = await loadReportLink('delivery', null, reply(500, {}) as never);
    expect(odd).toEqual({ ok: false, message: 'The server answered with status 500.' });
  });
  it('reports a network failure instead of throwing', async () => {
    const res = await loadReportLink('delivery', null, (async () => { throw new Error('offline'); }) as never);
    expect(res).toEqual({ ok: false, message: 'offline' });
  });
});
