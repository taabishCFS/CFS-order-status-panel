import { describe, expect, it } from 'vitest';
import { bookBulk, bookedBulkText, bookingProblem, carriedLines, carryLines, cascadeDrops, forcePmFrom, loadBookable, loadBookingPage, markLines, ordersFromMaxproCsv, rescheduleBulk } from './bulkDelivery';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const capture = () => {
  const calls: { url: string; body: unknown }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ rows: [], vans: [], marked: 2, cleared: 1, saved: 3, orders: 2, emailed: 2, emailFailed: 0, emailCode: null, pmChanged: 0 }), { status: 200 });
  }) as typeof fetch;
  return { calls, f };
};

describe('the legacy drop rules', () => {
  it('cascades drops: the same order keeps its drop, the next order takes the next one', () => {
    expect(cascadeDrops(['a', 'a', 'b', 'c', 'c'], ['', '', '', '', ''], 3)).toEqual(['3', '3', '4', '5', '5']);
    expect(cascadeDrops(['a', 'b', 'c'], ['', '', ''], 15)).toEqual(['15', '16', '16']);
    expect(cascadeDrops(['a', 'b'], ['x', 'y'], 0)).toEqual(['x', 'y']);
  });
  it('PM makes every row below PM', () => {
    expect(forcePmFrom(['AM', 'AM', 'AM', ''], 1)).toEqual(['AM', 'PM', 'PM', 'PM']);
  });
  it('checks the form in the legacy order and wording', () => {
    const ok = { date: '2026-12-02', vanId: 'v', drops: { a: '1' }, slots: { a: 'AM' } };
    expect(bookingProblem(ok, [])).toBe('Please Select Record(s) to Confirm Booking.');
    expect(bookingProblem({ ...ok, drops: { a: '' } }, ['a'])).toBe('Select Drop Number.');
    expect(bookingProblem({ ...ok, slots: { a: '' } }, ['a'])).toBe('Select Time Slot.');
    expect(bookingProblem({ ...ok, date: '' }, ['a'])).toBe('Select Delivery Date.');
    expect(bookingProblem({ ...ok, vanId: '' }, ['a'])).toBe('Select Driver/van.');
    expect(bookingProblem(ok, ['a'])).toBeNull();
  });
});

describe('the Maxpro CSV', () => {
  const header = 'Order,B,C,D,E,F,G,H,I,J';
  it('takes the order number from the first column', () => {
    const csv = [header, 'MX-UD3163 wgd dt,1,2,3,4,5,6,7,8,9', '"CFS336139",1,2,3,4,5,6,7,8,9', ',,,,,,,,,', 'RC-CFS-334834,1,2,3,4,5,6,7,8,9'].join('\r\n');
    expect(ordersFromMaxproCsv(csv)).toEqual({ ok: true, orders: ['UD3163', 'CFS336139', '334834'] });
  });
  it('refuses empty files and the wrong number of columns', () => {
    expect(ordersFromMaxproCsv('')).toMatchObject({ ok: false, message: 'The CSV appears to be empty.' });
    expect(ordersFromMaxproCsv('a,b,c\n1,2,3')).toMatchObject({ ok: false, message: expect.stringContaining('10 columns') });
  });
});

describe('calls', () => {
  it('loads the list with the search, brand and page', async () => {
    const { calls, f } = capture();
    await loadBookable({ q: 'UD3163,AB1', brand: 'Acme', page: 2 }, f);
    expect(calls[0].url).toBe('/api/delivery-bulk?q=UD3163%2CAB1&brand=Acme&page=2');
    expect(await loadBookable({}, reply(500, {}))).toMatchObject({ ok: false, message: expect.stringContaining('500') });
  });
  it('sends mark, load, book and reschedule', async () => {
    const { calls, f } = capture();
    expect(await markLines('TNT', ['a'], f)).toEqual({ ok: true, data: { marked: 2 } });
    await loadBookingPage(['a', 'b'], f);
    await bookBulk({ date: '2026-12-02', vanId: 'v', rows: [{ lineId: 'a', drop: 1, amPm: 'AM' }], allowDuplicate: false }, f);
    expect(await rescheduleBulk(['a'], f)).toEqual({ ok: true, data: { cleared: 1 } });
    expect(calls.map((c) => (c.body as { action: string }).action)).toEqual(['mark', 'load', 'book', 'reschedule']);
    expect(calls[2].body).toMatchObject({ vanId: 'v', allowDuplicate: false });
  });
  it('explains refusals, and a taken drop with the order names', async () => {
    expect(await bookBulk({ date: 'x', vanId: 'v', rows: [], allowDuplicate: false }, reply(409, { error: 'duplicate', duplicates: ['UD1'] }))).toMatchObject({ ok: false, duplicates: ['UD1'] });
    expect(await markLines('TNT', ['a'], reply(403, { error: 'no_permission' }))).toMatchObject({ ok: false, message: expect.stringContaining('permission') });
  });
  it('words the booking outcome', () => {
    expect(bookedBulkText({ saved: 3, orders: 2, emailed: 2, emailFailed: 0, emailCode: null, pmChanged: 1 }, false)).toBe('Booked 3 items on 2 orders. 1 later order was moved to PM. Booking confirmation emailed to 2 customers.');
    expect(bookedBulkText({ saved: 1, orders: 1, emailed: 0, emailFailed: 1, emailCode: 'email_off', pmChanged: 0 }, true)).toBe('Pre-booked 1 item on 1 order. 1 customer email was not sent (email is switched off).');
  });
});

describe('carrying the ticked lines', () => {
  it('hands them to the next page', () => {
    carryLines(['a', 'b']);
    expect(carriedLines()).toEqual(['a', 'b']);
  });
});
