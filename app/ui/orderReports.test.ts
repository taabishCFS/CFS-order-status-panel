import { describe, expect, it, vi } from 'vitest';
import { loadOrderReport, orderReportLink, presetRange, reportSearch } from './orderReports';

const q = { from: '2026-11-01', to: '2026-11-30', statuses: [4, 7], sort: 'date', dir: 'desc' as const, page: 2 };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('presetRange', () => {
  // 2026-11-27 is a Friday
  it.each([
    ['Today', '2026-11-27', '2026-11-27'],
    ['Yesterday', '2026-11-26', '2026-11-26'],
    ['Current Week', '2026-11-23', '2026-11-29'],
    ['Previous Week', '2026-11-16', '2026-11-22'],
    ['Current Month', '2026-11-01', '2026-11-30'],
    ['Previous Month', '2026-10-01', '2026-10-31'],
    ['Current Year', '2026-01-01', '2026-12-31'],
    ['Previous Year', '2025-01-01', '2025-12-31'],
  ] as const)('%s', (preset, from, to) => {
    expect(presetRange(preset, '2026-11-27')).toEqual({ from, to });
  });
  it('rolls back over a year end in January', () => {
    expect(presetRange('Previous Month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('calls', () => {
  it('sends the filters', () => {
    expect(reportSearch(q).toString()).toBe('from=2026-11-01&to=2026-11-30&sort=date&dir=desc&page=2&statuses=4%2C7');
  });
  it('returns the report, or the server message', async () => {
    expect((await loadOrderReport(q, reply(200, { rows: [], count: 0 }) as unknown as typeof fetch)).ok).toBe(true);
    expect(await loadOrderReport(q, reply(500, { message: 'Down' }) as unknown as typeof fetch)).toEqual({ ok: false, message: 'Down' });
  });
  it('asks for a download link with the brand', async () => {
    const f = reply(200, { url: 'https://x/e?t=1' });
    expect(await orderReportLink(q, 'Duke', f as unknown as typeof fetch)).toEqual({ ok: true, data: { url: 'https://x/e?t=1' } });
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('kind=order-report');
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('brand=Duke');
  });
});
