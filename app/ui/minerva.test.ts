import { describe, expect, it, vi } from 'vitest';
import { discText, loadMinerva, minervaLink, periodText, saveMinervaBrand } from './minerva';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const calledUrl = (f: ReturnType<typeof reply>) => String(f.mock.calls[0]?.[0 as never]);

describe('Minerva Supplier Orders', () => {
  it('loads the report with the dates', async () => {
    const f = reply(200, { rows: [], brands: [], allBrands: ['Ace'] });
    const r = await loadMinerva('2026-01-01', '2026-01-31', f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, data: { rows: [], brands: [], allBrands: ['Ace'] } });
    expect(calledUrl(f)).toContain('/api/minerva?from=2026-01-01&to=2026-01-31');
  });
  it('passes on the server message when saving fails', async () => {
    const f = reply(400, { error: 'bad_disc', message: 'Type the Minerva discount as a percentage between 0.01 and 50.' });
    expect(await saveMinervaBrand('Ace', '60', '2026-01-01', '2026-01-31', f as unknown as typeof fetch)).toEqual({ ok: false, message: 'Type the Minerva discount as a percentage between 0.01 and 50.' });
  });
  it('asks for a download link', async () => {
    const f = reply(200, { url: 'https://x/exports/delivery?t=1' });
    expect(await minervaLink('', '', f as unknown as typeof fetch)).toEqual({ ok: true, data: { url: 'https://x/exports/delivery?t=1' } });
    expect(calledUrl(f)).toContain('kind=minerva');
  });
  it('shows the discount and the period', () => {
    expect(discText(250)).toBe('2.5');
    expect(periodText({ fromDate: '2026-01-01', toDate: '2026-06-30' })).toBe('01/01/2026 to 30/06/2026');
  });
});
