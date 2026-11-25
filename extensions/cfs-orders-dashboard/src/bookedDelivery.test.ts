import { describe, expect, it } from 'vitest';
import { changedDrops, downloadLink, groupByDay, loadBooked, poundsText, rescheduleBooked, runTitle, saveDropsForRun, type BookedRow, type BookedRun } from './bookedDelivery';

const capture = (body: unknown, status = 200) => {
  const calls: { url: string; body: unknown }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, f };
};
const row = (id: string, drop: number | null): BookedRow => ({ lineId: id, orderId: 'o', orderName: 'UD1', orderDate: '2026-11-07', brand: 'A', product: 'p', code: 'c', size: '', quantity: 1, box: null, delivery: null, lineStatusId: 4, amPm: 'AM', drop, deliveryType: 'Free Door Delivery', postcode: 'E1', amountMinor: 100, emailed: true });
const run = (date: string, van: string): BookedRun => ({ key: `${date}|${van}`, date, vanId: van, vanName: van, driverName: 'Driver1', rows: [], totalMinor: 0, currency: 'GBP' });

describe('Delivery Booked helpers', () => {
  it('titles a run like the old page', () => {
    expect(runTitle({ date: '2026-11-25', vanName: 'Van 1', driverName: 'Driver1' })).toBe('25/11/2026 (Wednesday) - Van 1 - Driver1');
    expect(runTitle({ date: '2026-11-25', vanName: 'Van 2', driverName: '' })).toBe('25/11/2026 (Wednesday) - Van 2');
    expect(poundsText(751454)).toBe('£7514.54');
  });
  it('sends only the drops that changed, and refuses bad ones', () => {
    const rows = [row('a', 1), row('b', 2), row('c', 3)];
    expect(changedDrops(rows, { a: '1', b: '5', c: '' })).toEqual({ changes: [{ lineId: 'b', drop: 5 }], problem: null });
    expect(changedDrops(rows, { a: 'x' }).problem).toMatch(/whole numbers/);
  });
  it('groups runs by day', () => {
    const days = groupByDay([run('2026-11-25', 'v1'), run('2026-11-25', 'v2'), run('2026-11-26', 'v1')]);
    expect(days.map((d) => [d.date, d.runs.length])).toEqual([['2026-11-25', 2], ['2026-11-26', 1]]);
  });
});

describe('Delivery Booked calls', () => {
  it('loads with the filters in the query', async () => {
    const { calls, f } = capture({ runs: [], summary: { runs: 0, entries: 0 }, from: 'a', to: 'b', brands: [] });
    const r = await loadBooked({ from: '2026-11-25', to: '2026-11-26', brand: 'Acme', q: 'UD1' }, f);
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe('/api/delivery-booked?from=2026-11-25&to=2026-11-26&brand=Acme&q=UD1');
  });
  it('explains a refusal in words', async () => {
    const r = await saveDropsForRun({ date: '2026-11-25', vanId: 'v' }, [{ lineId: 'a', drop: 2 }], capture({ error: 'drop_limit', message: 'A van can have at most 16 drops. Choose a lower drop number.' }, 422).f);
    expect(r).toEqual({ ok: false, message: 'A van can have at most 16 drops. Choose a lower drop number.' });
    expect((await rescheduleBooked(['a'], '', capture({ error: 'no_permission' }, 403).f)).ok).toBe(false);
  });
  it('saves drops and reschedules', async () => {
    const a = capture({ ok: true, saved: 1, moved: 2 });
    expect(await saveDropsForRun({ date: '2026-11-25', vanId: 'v' }, [{ lineId: 'a', drop: 2 }], a.f)).toEqual({ ok: true, data: { saved: 1, moved: 2 } });
    expect(a.calls[0].body).toEqual({ action: 'drops', date: '2026-11-25', vanId: 'v', rows: [{ lineId: 'a', drop: 2 }] });
    const b = capture({ ok: true, cleared: 3 });
    expect(await rescheduleBooked(['a', 'b'], 'x', b.f)).toEqual({ ok: true, data: { cleared: 3 } });
  });
  it('asks for a download link for the page, the ticked lines and a run sheet', async () => {
    const { calls, f } = capture({ url: 'https://x/exports/delivery?t=1' });
    expect((await downloadLink({ kind: 'booked', filter: { from: '2026-11-25', to: '2026-11-25' }, lineIds: ['a', 'b'] }, f)).ok).toBe(true);
    await downloadLink({ kind: 'picklist', date: '2026-11-25', vanId: 'v1' }, f);
    expect(calls[0].url).toBe('/api/delivery-export?kind=booked&from=2026-11-25&to=2026-11-25&lines=a%2Cb');
    expect(calls[1].url).toBe('/api/delivery-export?kind=picklist&date=2026-11-25&van=v1');
  });
});
