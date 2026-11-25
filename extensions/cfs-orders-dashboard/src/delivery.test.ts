import { describe, expect, it } from 'vitest';
import { bookLines, bookedText, bookingLine, changeFleet, checkDrop, dropNumbers, loadFleet, loadOrderDelivery, rescheduleLines, rescheduledText, type BookForm } from './delivery';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const form: BookForm = { partner: 'CFS', date: '2026-12-02', vanId: 'v1', driverId: '', drop: '3', amPm: 'PM' };
const bodiesOf = () => {
  const bodies: unknown[] = [];
  const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ duplicates: [], saved: 1, cleared: 1, email: 'queued', fleet: { drivers: [], vans: [], slots: [] } }), { status: 200 });
  }) as typeof fetch;
  return { bodies, f };
};

describe('fleet', () => {
  it('loads and changes the lists', async () => {
    const fleet = { drivers: [], vans: [{ id: 'v', name: 'Van 1', extra: '', active: true }], slots: [] };
    expect(await loadFleet(reply(200, fleet))).toEqual({ ok: true, data: fleet });
    expect(await changeFleet({ kind: 'van', op: 'add', name: 'x' }, reply(200, { fleet }))).toEqual({ ok: true, data: fleet });
    expect(await changeFleet({ kind: 'van', op: 'add', name: 'x' }, reply(409, { error: 'duplicate_name' }))).toMatchObject({ ok: false, message: 'That name is already in the list.' });
    expect(await changeFleet({ kind: 'van', op: 'add', name: 'x' }, reply(403, { error: 'no_permission' }))).toMatchObject({ ok: false, message: expect.stringContaining('permission') });
    expect(await loadFleet(reply(500, {}))).toMatchObject({ ok: false, message: expect.stringContaining('500') });
  });
});

describe('booking calls', () => {
  it('sends blanks as null and the drop as given', async () => {
    const { bodies, f } = bodiesOf();
    await checkDrop('1', ['L1'], form, f);
    await bookLines('1', ['L1'], form, true, true, f);
    expect(bodies[0]).toEqual({ action: 'check', lineIds: ['L1'], partner: 'CFS', date: '2026-12-02', vanId: 'v1', driverId: null, drop: '3', amPm: 'PM', allowDuplicate: false, emailCustomer: false });
    expect(bodies[1]).toMatchObject({ action: 'book', allowDuplicate: true, emailCustomer: true });
  });
  it('explains a taken drop with the order names', async () => {
    const r = await bookLines('1', ['L1'], form, false, false, reply(409, { error: 'duplicate', duplicates: ['#1002'] }));
    expect(r).toMatchObject({ ok: false, duplicate: true, duplicates: ['#1002'], message: 'Already booked for that date, van and drop: #1002.' });
  });
  it('explains refusals', async () => {
    expect(await bookLines('1', ['L1'], form, false, false, reply(422, { error: 'unknown_van' }))).toMatchObject({ ok: false, message: expect.stringContaining('van') });
    expect(await loadOrderDelivery('1', reply(200, { fleet: {}, bookings: [], history: [] }))).toMatchObject({ ok: true });
  });
  it('reschedules with a reason', async () => {
    const { bodies, f } = bodiesOf();
    expect(await rescheduleLines('1', ['L1'], 'Van broke down', true, f)).toEqual({ ok: true, data: { cleared: 1, email: 'queued' } });
    expect(bodies[0]).toEqual({ action: 'reschedule', lineIds: ['L1'], reason: 'Van broke down', emailCustomer: true });
    expect(await rescheduleLines('1', ['L1'], '', true, reply(400, { error: 'reason_required' }))).toMatchObject({ ok: false, message: 'Give a reason for rescheduling.' });
  });
});

describe('words', () => {
  it('says what happened', () => {
    expect(bookedText({ saved: 1 })).toBe('Delivery booked for 1 item.');
    expect(bookedText({ saved: 3, pmChanged: 2 })).toBe('Delivery booked for 3 items. 2 later orders were moved to PM.');
    expect(bookedText({ saved: 1, email: 'queued' })).toBe('Delivery booked for 1 item. The customer is being emailed.');
    expect(bookedText({ saved: 1, email: 'email_off' })).toContain('email is switched off');
    expect(rescheduledText({ cleared: 2, email: 'queued' })).toBe('Delivery rescheduled for 2 items. The customer is being emailed.');
    expect(rescheduledText({ cleared: 1, email: 'not_requested' })).toBe('Delivery rescheduled for 1 item.');
    expect(rescheduledText({ cleared: 1, email: 'email_off' })).toContain('email is switched off');
  });
  it('describes a booking and lists the drops', () => {
    expect(bookingLine({ lineId: 'L', date: '2026-12-02', vanId: 'v', vanName: 'Van 1', driverId: 'd', driverName: 'Dan', drop: 2, amPm: 'AM', partner: 'CFS', bookedByName: 'S' })).toBe('02/12/2026 · Van: Van 1 · Driver: Dan · Drop 2 · AM');
    expect(bookingLine({ lineId: 'L', date: '2026-12-02', vanId: null, vanName: '', driverId: null, driverName: '', drop: null, amPm: null, partner: 'TNT', bookedByName: 'S' })).toBe('TNT · 02/12/2026');
    expect(bookingLine({ lineId: 'L', date: '2026-12-02', vanId: null, vanName: '', driverId: null, driverName: '', drop: null, amPm: 'ALL', partner: 'CFS', bookedByName: 'S' })).toBe('02/12/2026 · All Day');
    expect(dropNumbers()).toHaveLength(16);
    expect(dropNumbers()[15]).toBe(16);
  });
});
