import { describe, expect, it } from 'vitest';
import { buildTiles, loadCounts } from './dashboardCounts';

const counts = { inProgress: 12, lapsed: 3, chaseup: 0, refunds: 2, sbts: 0, freeStock: 40 };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe('dashboard tiles', () => {
  it('reads the counts, or nothing when the answer is wrong', async () => {
    expect(await loadCounts(reply(200, counts))).toEqual(counts);
    expect(await loadCounts(reply(200, { inProgress: 1 }))).toBeNull();
    expect(await loadCounts(reply(500, {}))).toBeNull();
    expect(await loadCounts((async () => { throw new Error('offline'); }) as typeof fetch)).toBeNull();
  });
  it('colours by urgency', () => {
    const t = Object.fromEntries(buildTiles(counts).map((x) => [x.key, x]));
    expect(t.lapsed.tone).toBe('critical');
    expect(t.chaseup.tone).toBe('success');
    expect(t.refunds.tone).toBe('warning');
    expect(t.sbts.tone).toBe('success');
    expect(t.inProgress.tone).toBe('info');
    expect(t.freeStock.value).toBe(40);
  });
  it('shows neutral blanks while loading or failed', () => {
    for (const t of buildTiles(null)) { expect(t.value).toBeNull(); expect(['neutral', 'info']).toContain(t.tone); }
  });
  it('links each tile to an existing screen', () => {
    expect(buildTiles(counts).map((t) => t.href).sort()).toEqual(['/date-lapsed', '/orders-by-brand', '/refunds', '/sbts', '/stock', '/supplier-chaseup']);
  });
});
