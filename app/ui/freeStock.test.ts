import { describe, expect, it } from 'vitest';
import { addFreeStock, deleteFreeStock, editFrom, emptyInput, inputProblem, loadFreeStock, updateFreeStock, type FreeStockItem } from './freeStock';
import { importFreeStock, importSummary, parseFreeStockCsv } from './freeStockImport';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const urlsSeen: string[] = [];
const spy = (status: number, body: unknown) => async (url: RequestInfo | URL) => { urlsSeen.push(String(url)); return reply(status, body)(); };

describe('inputProblem', () => {
  const ok = { ...emptyInput(), brand: 'Actona', productCode: 'A1' };
  it('accepts a form with a brand, a code and a quantity', () => expect(inputProblem(ok)).toBeNull());
  it('says what is missing or wrong', () => {
    expect(inputProblem({ ...ok, brand: ' ' })).toMatch(/brand/);
    expect(inputProblem({ ...ok, productCode: '' })).toMatch(/code/);
    for (const qty of ['0', 'x', '1.5', '']) expect(inputProblem({ ...ok, qty })).toMatch(/quantity/);
    expect(inputProblem({ ...ok, cost: 'lots' })).toMatch(/cost/);
    expect(inputProblem({ ...ok, cost: '£12.50' })).toBeNull();
  });
});

describe('loadFreeStock', () => {
  it('asks for the page, search, view and type, leaving out the defaults', async () => {
    urlsSeen.length = 0;
    const page = { items: [], total: 0, page: 1, pageCount: 1, itemTypes: [] };
    const r = await loadFreeStock({ search: ' bed ', view: 'used', type: 'SBTS', page: 3 }, spy(200, page) as typeof fetch);
    expect(r.ok).toBe(true);
    expect(urlsSeen[0]).toContain('/api/free-stock?search=bed&view=used&type=SBTS&page=3');
    urlsSeen.length = 0;
    await loadFreeStock({}, spy(200, page) as typeof fetch);
    expect(urlsSeen[0]).toMatch(/\/api\/free-stock$/);
  });
  it('turns a failure into a message', async () => {
    const r = await loadFreeStock({}, reply(500, {}) as typeof fetch);
    expect(r).toEqual({ ok: false, message: 'The server answered with status 500.' });
  });
});

describe('addFreeStock', () => {
  it('succeeds, and shows the server reason or a plain explanation on failure', async () => {
    expect(await addFreeStock(emptyInput(), reply(200, { ok: true }) as typeof fetch)).toEqual({ ok: true });
    expect(await addFreeStock(emptyInput(), reply(400, { error: 'bad_request', message: 'The brand is empty.' }) as typeof fetch)).toEqual({ ok: false, message: 'The brand is empty.' });
    expect(await addFreeStock(emptyInput(), reply(403, { error: 'staff_not_verified' }) as typeof fetch)).toEqual({ ok: false, message: 'Only a verified staff member can change stock.' });
  });
});

describe('parseFreeStockCsv', () => {
  it('reads the sample layout, numbering rows like the spreadsheet', () => {
    const csv = 'Item Type,Source Order,Brand,Product Name,Qty,Product Code,Warehouse Code,RMA,Remarks,Cost,Credit/FOC,Status,Collection\nfreeStock,12,Actona,Bed,2,A1,,,boxed,125.00,,,\n,,,,,,,,,,,,\nfreeStock,,Duke,Chair,1,D2,BAY1,,,,,,\n';
    const r = parseFreeStockCsv(csv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows.map((x) => x.line)).toEqual([2, 4]);
      expect(r.rows[0]).toMatchObject({ itemType: 'freeStock', sourceOrder: '12', brand: 'Actona', productName: 'Bed', qty: '2', productCode: 'A1', remarks: 'boxed', cost: '125.00' });
      expect(r.rows[1]).toMatchObject({ brand: 'Duke', warehouseCode: 'BAY1' });
    }
  });
  it('understands the old system headings and ignores columns we do not use', () => {
    const r = parseFreeStockCsv('ItemType,Order No,Brand,iBrandId,ProductName,Qty,Product Code,WHS Code,Item Cost,Assigned Orders\nfreeStock,9,Actona,44,Bed,3,A1,FSS7,10.5,"1,2"');
    expect(r.ok && r.rows[0]).toMatchObject({ sourceOrder: '9', brand: 'Actona', productName: 'Bed', qty: '3', warehouseCode: 'FSS7', cost: '10.5' });
  });
  it('asks for the headings it needs, and refuses empty or huge files', () => {
    expect(parseFreeStockCsv('Brand,Product Name\nA,B')).toMatchObject({ ok: false, message: expect.stringContaining('Brand, Qty and Product Code') });
    expect(parseFreeStockCsv('Brand,Qty,Product Code\n')).toMatchObject({ ok: false, message: 'The file has no stock rows in it.' });
    const big = 'Brand,Qty,Product Code\n' + 'A,1,X\n'.repeat(5001);
    expect(parseFreeStockCsv(big)).toMatchObject({ ok: false, message: expect.stringContaining('at most 5000') });
  });
});

describe('importFreeStock', () => {
  it('returns the result, or the reason it failed', async () => {
    const result = { added: 2, rejected: [], rejectedCount: 0 };
    expect(await importFreeStock([], reply(200, result) as typeof fetch)).toEqual({ ok: true, result });
    expect(await importFreeStock([], reply(400, { error: 'too_many_rows' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('5000') });
  });
  it('summarises in a sentence', () => {
    expect(importSummary({ added: 5, rejected: [], rejectedCount: 0 })).toBe('Import finished: 5 added.');
    expect(importSummary({ added: 5, rejected: [], rejectedCount: 2 })).toBe('Import finished: 5 added, 2 skipped.');
  });
});

describe('edit and delete', () => {
  const item: FreeStockItem = { id: 'f1', itemType: 'freeStock', sourceOrder: '1038', brand: 'Actona', productName: 'Bed', qty: 3, productCode: 'A1', warehouseCode: 'FSS1', rma: '', remarks: 'boxed', cost: '125.50', creditFoc: '', status: '', collection: '', addedByName: 'Sam', allocatedTo: [] };
  it('starts the edit form from the listed item, with the quantity as text', () => {
    expect(editFrom(item)).toMatchObject({ brand: 'Actona', qty: '3', cost: '125.50', warehouseCode: 'FSS1', remarks: 'boxed' });
  });
  it('lets a correction use quantity 0 but not a new item', () => {
    expect(inputProblem({ ...editFrom(item), qty: '0' }, 0)).toBeNull();
    expect(inputProblem({ ...editFrom(item), qty: '0' })).toMatch(/1 or more/);
    expect(inputProblem({ ...editFrom(item), qty: '-1' }, 0)).toMatch(/0 or more/);
  });
  it('sends the id with the new values, or with remove: true', async () => {
    const bodies: unknown[] = [];
    const record = (status: number, body: unknown) => async (_url: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return reply(status, body)(); };
    expect(await updateFreeStock('f1', editFrom(item), record(200, { ok: true }) as typeof fetch)).toEqual({ ok: true });
    expect(await deleteFreeStock('f1', record(200, { ok: true }) as typeof fetch)).toEqual({ ok: true });
    expect(bodies[0]).toMatchObject({ id: 'f1', item: { brand: 'Actona', qty: '3' } });
    expect(bodies[1]).toEqual({ id: 'f1', remove: true });
  });
  it('explains a failure, including a record that is already gone', async () => {
    expect(await updateFreeStock('f1', editFrom(item), reply(400, { error: 'bad_request', message: 'The brand is empty.' }) as typeof fetch)).toEqual({ ok: false, message: 'The brand is empty.' });
    expect(await deleteFreeStock('f1', reply(404, { error: 'not_found' }) as typeof fetch)).toEqual({ ok: false, message: 'That stock item no longer exists. Reload the page.' });
    expect(await deleteFreeStock('f1', reply(403, { error: 'staff_not_verified' }) as typeof fetch)).toEqual({ ok: false, message: 'Only a verified staff member can change stock.' });
  });
});
