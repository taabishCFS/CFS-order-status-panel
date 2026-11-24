import { describe, expect, it } from 'vitest';
import { addContainer, addFreight, containerProblem, deleteContainer, editFrom, emptyContainer, freightText, importContainers, loadContainers, parseContainerCsv, updateContainer, type ContainerItem } from './containers';
import { allocateStock, loadOrderStock, removeAllocation } from './stockAllocation';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const recorder = (bodies: unknown[], urls: string[] = []) => (async (u: RequestInfo | URL, init?: RequestInit) => {
  urls.push(String(u));
  if (init?.body) bodies.push(JSON.parse(String(init.body)));
  return reply(200, { ok: true })();
}) as typeof fetch;

const good = { ...emptyContainer(), itemVendor: 'V', containerNo: '12', productCode: 'A1', qty: '5' };

describe('containerProblem', () => {
  it('accepts a good form and says what is missing otherwise', () => {
    expect(containerProblem(good)).toBeNull();
    expect(containerProblem({ ...good, itemVendor: ' ' })).toMatch(/vendor/);
    expect(containerProblem({ ...good, containerNo: '' })).toMatch(/container number/);
    expect(containerProblem({ ...good, productCode: '' })).toMatch(/product code/);
    expect(containerProblem({ ...good, qty: '0' })).toMatch(/1 or more/);
    expect(containerProblem({ ...good, qty: '0' }, 0)).toBeNull();
    expect(containerProblem({ ...good, costDollar: 'abc' })).toMatch(/dollar cost/);
    expect(containerProblem({ ...good, totalCbm: 'x' })).toMatch(/CBM/);
    expect(containerProblem({ ...good, expectedDate: '12-2026' })).toMatch(/expected date/);
    expect(containerProblem({ ...good, expectedDate: '31/12/2026', costDollar: '$1,250.50' })).toBeNull();
  });
});

describe('parseContainerCsv', () => {
  const header = 'SKU,Item Vendor,Container No,Product Name,Product Code,WHS Code,Cost ($),Price,Delivery Cost,Added Qty,Qty,Total CBM,Expected Date,Container Range';
  it('reads the sample layout and skips blank lines', () => {
    const r = parseContainerCsv(`${header}\nS1,Vendor,1234,Bed,BED-1,,100,250,12,10,10,5.5,31/12/2026,Range\n,,,,,,,,,,,,,\n`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ line: 2, sku: 'S1', itemVendor: 'Vendor', containerNo: '1234', productCode: 'BED-1', costDollar: '100', qty: '10', addedQty: '10', expectedDate: '31/12/2026', containerRange: 'Range' });
    }
  });
  it('understands the old system headings', () => {
    const r = parseContainerCsv('vSKU,itemVendor,containerNo,vProductName,product_code,whsCode,vCost,fPrice,delvCost,addedQty,iQty,totalCBM,expectedDate,containerRange\nS,V,9,P,C,,1,2,3,4,5,6,2026-12-31,R');
    expect(r.ok && r.rows[0]).toMatchObject({ itemVendor: 'V', containerNo: '9', productName: 'P', productCode: 'C', qty: '5', addedQty: '4' });
  });
  it('refuses a file without the needed headings or rows', () => {
    expect(parseContainerCsv('Brand,Qty\nA,1')).toMatchObject({ ok: false, message: expect.stringContaining('Item Vendor') });
    expect(parseContainerCsv(`${header}\n`)).toMatchObject({ ok: false, message: expect.stringContaining('no container rows') });
  });
});

describe('talking to the server', () => {
  it('posts each kind of change', async () => {
    const bodies: unknown[] = [];
    const f = recorder(bodies);
    expect(await addContainer(good, f)).toEqual({ ok: true });
    expect(await updateContainer('c1', good, f)).toEqual({ ok: true });
    expect(await deleteContainer('c1', f)).toEqual({ ok: true });
    expect(await addFreight('V', '12', '850', f)).toEqual({ ok: true });
    expect(bodies).toEqual([{ item: good }, { id: 'c1', item: good }, { id: 'c1', remove: true }, { freight: { itemVendor: 'V', containerNo: '12', freight: '850' } }]);
  });
  it('explains a refused delete and a failed import', async () => {
    expect(await deleteContainer('c1', reply(409, { error: 'allocated' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('Take it back from the order first') });
    expect(await importContainers([], reply(403, { error: 'staff_not_verified' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('verified staff') });
    expect(await addFreight('V', '1', 'x', reply(400, { error: 'bad_request', message: 'The freight must be an amount above zero, like 850.00.' }) as typeof fetch)).toMatchObject({ ok: false, message: expect.stringContaining('above zero') });
  });
  it('loads a page with its freight, filling in no freight when the server sends none', async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return reply(200, { items: [], total: 0, page: 1, pageCount: 1 })(); }) as typeof fetch;
    const r = await loadContainers({ search: ' bed ', view: 'onWater', page: 2 }, f);
    expect(r).toEqual({ ok: true, data: { items: [], total: 0, page: 1, pageCount: 1, freight: [] } });
    expect(urls[0]).toContain('search=bed');
    expect(urls[0]).toContain('view=onWater');
    expect(urls[0]).toContain('page=2');
  });
});

describe('small helpers', () => {
  it('edit form starts from the listed item, and freight reads in plain words', () => {
    const it = { id: 'c1', sku: 'S', itemVendor: 'V', containerRange: 'R', containerNo: '12', productName: 'P', productCode: 'A1', warehouseCode: 'CON1', costDollar: '100.00', cost: '81.00', price: '250.00', delvCost: '', addedQty: 10, qty: 4, totalCbm: '5.5', expectedDate: '31/12/2026', onWater: true, freight: '', addedByName: null, allocatedTo: [] } as ContainerItem;
    expect(editFrom(it)).toMatchObject({ itemVendor: 'V', containerNo: '12', qty: '4', addedQty: '10', costDollar: '100.00', expectedDate: '31/12/2026' });
    expect(freightText({ itemVendor: 'V', containerNo: '12', freight: '900.00', entries: 2 })).toBe('V, container 12: £900.00 paid (2 payments)');
  });
});

describe('order screen with container stock', () => {
  it('uses the container address and the stockId key', async () => {
    const bodies: unknown[] = [];
    const urls: string[] = [];
    const f = recorder(bodies, urls);
    await allocateStock('1038', 'L1', 'c1', 2, f, 'container');
    await removeAllocation('1038', 'a1', f, 'container');
    await loadOrderStock('1038', f, 'container');
    expect(urls.every((u) => u.includes('api/orders/1038/container'))).toBe(true);
    expect(bodies).toEqual([{ action: 'allocate', lineId: 'L1', stockId: 'c1', qty: 2 }, { action: 'remove', allocationId: 'a1' }]);
  });
});

