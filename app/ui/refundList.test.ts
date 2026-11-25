import { describe, expect, it, vi } from 'vitest';
import { buildRefundQuery, claimOptions, exportChoice, historySummary, loadRefundList, recordRefunded, refundAction, refundedText, sortLink, titleFor } from './refundList';

const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const refuse = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('buildRefundQuery', () => {
  it('keeps the filters that are set and drops the empty ones', () => {
    expect(buildRefundQuery({ page: 2, from: '2026-11-01', to: '2026-11-21', q: ' 1001', view: 'refunded', sort: 'amount', dir: 'asc' })).toBe('?page=2&from=2026-11-01&to=2026-11-21&q=%201001&view=refunded&sort=amount&dir=asc');
    expect(buildRefundQuery({})).toBe('');
    expect(buildRefundQuery({ all: true, view: null })).toBe('?all=1');
  });
});

describe('titles and texts', () => {
  it('names the three views like the legacy buttons', () => {
    expect(titleFor('pending')).toBe('Pending refunds');
    expect(titleFor('refunded')).toBe('Refunded');
    expect(titleFor('all')).toBe('Refunds');
  });
  it('shows Refunded: Yes and the transaction id, or nothing before it is refunded', () => {
    expect(refundedText({ status: 'done', transactionId: 'T1' })).toEqual({ refunded: 'Yes', transaction: 'T1', missingId: false });
    expect(refundedText({ status: 'done', transactionId: null })).toEqual({ refunded: 'Yes', transaction: '', missingId: true });
    expect(refundedText({ status: 'requested', transactionId: null })).toEqual({ refunded: '', transaction: '', missingId: false });
  });
  it('offers the legacy Claim? choices', () => {
    expect(claimOptions.map((o) => o.label)).toEqual(['Claim?', 'Claimable', 'Non Claimable']);
  });
  it('flips the sort direction on the same column and starts descending on a new one', () => {
    expect(sortLink({ sort: 'amount', dir: 'desc' }, 'amount')).toEqual({ sort: 'amount', dir: 'asc' });
    expect(sortLink({ sort: 'amount', dir: 'asc' }, 'amount')).toEqual({ sort: 'amount', dir: 'desc' });
    expect(sortLink({ sort: null, dir: 'desc' }, 'order')).toEqual({ sort: 'order', dir: 'desc' });
  });
});

describe('exportChoice (legacy: dates and a view export everything shown, otherwise the ticked rows)', () => {
  it('exports the filtered list when both dates and a view are chosen', () => {
    expect(exportChoice({ from: '2026-11-01', to: '2026-11-21', view: 'refunded' }, [])).toEqual({ kind: 'filtered' });
  });
  it('exports the ticked rows otherwise, and asks for ticks when there are none', () => {
    expect(exportChoice({ from: '', to: '', view: null }, ['r1', 'r2'])).toEqual({ kind: 'selected', ids: ['r1', 'r2'] });
    expect(exportChoice({ from: '2026-11-01', to: '', view: 'refunded' }, [])).toEqual({ message: 'Please select record(s) to export.' });
  });
});

describe('historySummary', () => {
  it('describes the refund for the order history', () => {
    expect(historySummary({ amountMinor: 2550, reason: 'DamagedPartRefund', transactionId: 'T1' })).toBe('Refunded £25.50 (Trans. ID T1): Damaged Part Refund');
  });
});

describe('loadRefundList and refundAction', () => {
  it('loads a page', async () => {
    const res = await loadRefundList({ view: 'pending' }, ok({ rows: [], total: 0, page: 1, pageCount: 1, capped: false, view: 'pending' }));
    expect(res).toMatchObject({ ok: true, data: { total: 0, view: 'pending' } });
  });
  it('explains a refusal in plain words', async () => {
    expect(await refundAction({ action: 'markRefunded', id: 'r1', transactionId: '' }, refuse(400, { error: 'bad_transaction_id' }))).toEqual({ ok: false, message: 'Enter the transaction ID from the payment provider.' });
    expect(await refundAction({ action: 'remove', ids: ['r1'] }, refuse(403, { error: 'staff_not_verified' }))).toEqual({ ok: false, message: 'Only a verified staff member can change the refund list.' });
    expect(await refundAction({ action: 'add' }, refuse(404, { error: 'no_order' }))).toEqual({ ok: false, message: 'No order found with that order number.' });
    expect(await refundAction({ action: 'markRefunded', id: 'r1', transactionId: 'T' }, refuse(409, { error: 'already_refunded' }))).toEqual({ ok: false, message: 'This request already has a transaction ID.' });
  });
  it('returns the answer on success', async () => {
    expect(await refundAction({ action: 'remove', ids: ['r1'] }, ok({ ok: true, count: 1 }))).toEqual({ ok: true, body: { ok: true, count: 1 } });
  });
});

describe('recordRefunded (the order history entry)', () => {
  const actor = { id: '9', name: 'Sam' } as never;
  const req = { orderId: 'gid://shopify/Order/1', amountMinor: 2550, reason: 'DamagedPartRefund', transactionId: 'T1' };
  const loaded = { state: { schemaVersion: 2, lines: {}, history: [] } as never, digest: 'd' };

  it('adds a refund entry to the order and refreshes its copy', async () => {
    const save = vi.fn(async (_id: string, _l: unknown, build: (s: never) => { history: { scope: string; values?: { to: string }[] }[] }) => {
      const next = build(loaded.state);
      expect(next.history[0].scope).toBe('refund');
      expect(next.history[0].values?.[0].to).toBe('Refunded £25.50 (Trans. ID T1): Damaged Part Refund');
      return { ok: true } as never;
    });
    const sync = vi.fn(async () => {});
    const res = await recordRefunded(req, actor, { load: async () => loaded, save: save as never, sync, now: () => '2026-11-23T10:00:00.000Z', newId: () => 'e1' });
    expect(res).toEqual({ ok: true });
    expect(sync).toHaveBeenCalledWith('gid://shopify/Order/1');
  });
  it('reports a stale record or an error without throwing', async () => {
    const stale = await recordRefunded(req, actor, { load: async () => loaded, save: (async () => ({ ok: false, reason: 'stale' })) as never, sync: async () => {} });
    expect(stale).toEqual({ ok: false, message: 'Someone else changed this order, so its history entry was not recorded.' });
    const boom = await recordRefunded(req, actor, { load: async () => { throw new Error('offline'); }, sync: async () => {} });
    expect(boom).toEqual({ ok: false, message: 'offline' });
  });
});
