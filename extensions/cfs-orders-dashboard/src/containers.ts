// The Containers screen: stock arriving in containers, the freight paid per container, and the spreadsheet import.
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import { splitCsv } from './brandTermsImport';

export type ContainerView = 'available' | 'onWater' | 'used' | 'all';

export interface ContainerItem {
  id: string;
  sku: string;
  itemVendor: string;
  containerRange: string;
  containerNo: string;
  productName: string;
  productCode: string;
  warehouseCode: string;
  costDollar: string; // dollars as text, "" when not known
  cost: string; // pounds as text
  price: string;
  delvCost: string;
  addedQty: number;
  qty: number;
  totalCbm: string;
  expectedDate: string; // 31/12/2026 or ""
  onWater: boolean;
  freight: string; // pounds paid for this container and vendor, "" when none
  addedByName: string | null;
  allocatedTo: string[];
}

export interface ContainerFreightRow {
  itemVendor: string;
  containerNo: string;
  freight: string;
  entries: number;
}

export interface ContainerPage {
  items: ContainerItem[];
  total: number;
  page: number;
  pageCount: number;
  freight: ContainerFreightRow[];
}

/** The form's fields, all text. */
export interface ContainerInput {
  itemVendor: string;
  containerNo: string;
  productCode: string;
  productName: string;
  sku: string;
  warehouseCode: string;
  costDollar: string;
  price: string;
  delvCost: string;
  addedQty: string;
  qty: string;
  totalCbm: string;
  expectedDate: string;
  containerRange: string;
}

export const VIEW_OPTIONS: { value: ContainerView; label: string }[] = [
  { value: 'available', label: 'In stock' },
  { value: 'onWater', label: 'On the water' },
  { value: 'used', label: 'Used up' },
  { value: 'all', label: 'All' },
];

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change container stock.',
  too_many_rows: 'Please import at most 5000 rows at a time.',
  bad_request: 'That container item could not be used.',
  not_found: 'That container item no longer exists. Reload the page.',
  allocated: 'This item has been given to an order, so it cannot be deleted. Take it back from the order first.',
};
const explain = (status: number, body: { error?: string; message?: string } | null) => body?.message || (body?.error && EXPLAIN[body.error]) || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });

type Done = { ok: true } | { ok: false; message: string };

async function post(payload: unknown, fetchFn: typeof fetch): Promise<Done> {
  try {
    const res = await callBackendResult('/api/containers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, fetchFn);
    const body = res.body as { error?: string; message?: string } | null;
    return res.ok ? { ok: true } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export async function loadContainers(
  params: { search?: string; view?: ContainerView; page?: number },
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; data: ContainerPage } | { ok: false; message: string }> {
  const q = new URLSearchParams();
  if (params.search?.trim()) q.set('search', params.search.trim());
  if (params.view) q.set('view', params.view);
  if (params.page && params.page > 1) q.set('page', String(params.page));
  try {
    const res = await callBackendResult(`/api/containers${q.toString() ? `?${q}` : ''}`, undefined, fetchFn);
    const body = res.body as (Partial<ContainerPage> & { error?: string }) | null;
    return res.ok && Array.isArray(body?.items) ? { ok: true, data: { freight: [], ...(body as ContainerPage) } } : { ok: false, message: explain(res.status, body) };
  } catch (e) {
    return failure(e);
  }
}

export const addContainer = (item: ContainerInput, fetchFn: typeof fetch = fetch) => post({ item }, fetchFn);
/** Correct a record. Quantity 0 marks it used up. */
export const updateContainer = (id: string, item: ContainerInput, fetchFn: typeof fetch = fetch) => post({ id, item }, fetchFn);
export const deleteContainer = (id: string, fetchFn: typeof fetch = fetch) => post({ id, remove: true }, fetchFn);
/** Record freight paid for a container from a vendor. */
export const addFreight = (itemVendor: string, containerNo: string, freight: string, fetchFn: typeof fetch = fetch) => post({ freight: { itemVendor, containerNo, freight } }, fetchFn);

export const emptyContainer = (): ContainerInput => ({
  itemVendor: '', containerNo: '', productCode: '', productName: '', sku: '', warehouseCode: '', costDollar: '', price: '', delvCost: '', addedQty: '', qty: '1', totalCbm: '', expectedDate: '', containerRange: '',
});

/** The edit form's starting values for a listed item. */
export const editFrom = (it: ContainerItem): ContainerInput => ({
  itemVendor: it.itemVendor, containerNo: it.containerNo, productCode: it.productCode, productName: it.productName, sku: it.sku, warehouseCode: it.warehouseCode,
  costDollar: it.costDollar, price: it.price, delvCost: it.delvCost, addedQty: String(it.addedQty), qty: String(it.qty), totalCbm: it.totalCbm, expectedDate: it.expectedDate, containerRange: it.containerRange,
});

const AMOUNT = /^[£$\s]*\d[\d,]*(\.\d{1,2})?\s*$/;

/** What is wrong with the form, or null when it can be saved. A quick check before asking the server. */
export function containerProblem(i: ContainerInput, qtyMin = 1): string | null {
  if (!i.itemVendor.trim()) return 'Enter the item vendor.';
  if (!i.containerNo.trim()) return 'Enter the container number.';
  if (!i.productCode.trim()) return 'Enter the product code.';
  if (!/^\d+$/.test(i.qty.trim()) || Number(i.qty) < qtyMin) return `The quantity must be a whole number, ${qtyMin} or more.`;
  if (i.addedQty.trim() && !/^\d+$/.test(i.addedQty.trim())) return 'The added quantity must be a whole number.';
  for (const [label, v] of [['dollar cost', i.costDollar], ['price', i.price], ['delivery cost', i.delvCost]] as const) {
    if (v.trim() && !AMOUNT.test(v)) return `The ${label} must be an amount like 12.50.`;
  }
  if (i.totalCbm.trim() && !/^\d+(\.\d+)?$/.test(i.totalCbm.trim())) return 'The total CBM must be a number.';
  if (i.expectedDate.trim() && !/^(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{1,2}-\d{1,2})$/.test(i.expectedDate.trim())) return 'The expected date must look like 31/12/2026.';
  return null;
}

/** The freight total shown beside a container: "Vendor A, container 1234: £900.00 paid". */
export const freightText = (f: ContainerFreightRow) => `${f.itemVendor}, container ${f.containerNo}: £${f.freight} paid${f.entries > 1 ? ` (${f.entries} payments)` : ''}`;

// ---- Spreadsheet import ----
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2_000_000;

export interface ContainerRow {
  line: number;
  sku: string;
  itemVendor: string;
  containerNo: string;
  productName: string;
  productCode: string;
  warehouseCode: string;
  costDollar: string;
  price: string;
  delvCost: string;
  addedQty: string;
  qty: string;
  totalCbm: string;
  expectedDate: string;
  containerRange: string;
}

export interface ContainerImportResult {
  added: number;
  rejected: { line: number | null; reason: string }[];
  rejectedCount: number;
}

// Headings are matched without case, spaces or punctuation. The old system's headings work too.
const ALIASES: Record<keyof Omit<ContainerRow, 'line'>, string[]> = {
  sku: ['sku', 'vsku'],
  itemVendor: ['itemvendor', 'vendor'],
  containerNo: ['containerno', 'container', 'containernumber'],
  productName: ['productname', 'vproductname', 'item', 'name'],
  productCode: ['productcode', 'code'],
  warehouseCode: ['whscode', 'warehousecode'],
  costDollar: ['cost', 'costdollar', 'vcost', 'vcostindollar'],
  price: ['price', 'fprice'],
  delvCost: ['deliverycost', 'delvcost'],
  addedQty: ['addedqty'],
  qty: ['qty', 'quantity', 'iqty'],
  totalCbm: ['totalcbm', 'cbm'],
  expectedDate: ['expecteddate', 'expected'],
  containerRange: ['containerrange', 'factory', 'range'],
};
const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The container rows in a spreadsheet saved as CSV. The first row must have headings, including Item Vendor, Container No and Product Code. */
export function parseContainerCsv(text: string): { ok: true; rows: ContainerRow[] } | { ok: false; message: string } {
  const all = splitCsv(text);
  const header = (all[0] ?? []).map(key);
  const at = {} as Record<keyof Omit<ContainerRow, 'line'>, number>;
  for (const field of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) at[field] = header.findIndex((h) => ALIASES[field].includes(h));
  if (at.itemVendor < 0 || at.containerNo < 0 || at.productCode < 0 || (at.qty < 0 && at.addedQty < 0)) {
    return { ok: false, message: 'The first row must have the headings Item Vendor, Container No, Product Code and Qty. Download the sample to see the layout.' };
  }
  const cell = (cells: string[], field: keyof typeof ALIASES) => (at[field] >= 0 ? (cells[at[field]] ?? '').trim() : '');
  const rows: ContainerRow[] = [];
  all.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return; // a blank line
    rows.push({
      line: i + 2,
      sku: cell(cells, 'sku'), itemVendor: cell(cells, 'itemVendor'), containerNo: cell(cells, 'containerNo'), productName: cell(cells, 'productName'), productCode: cell(cells, 'productCode'),
      warehouseCode: cell(cells, 'warehouseCode'), costDollar: cell(cells, 'costDollar'), price: cell(cells, 'price'), delvCost: cell(cells, 'delvCost'), addedQty: cell(cells, 'addedQty'),
      qty: cell(cells, 'qty'), totalCbm: cell(cells, 'totalCbm'), expectedDate: cell(cells, 'expectedDate'), containerRange: cell(cells, 'containerRange'),
    });
  });
  if (rows.length === 0) return { ok: false, message: 'The file has no container rows in it.' };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `The file has ${rows.length} rows. Please import at most ${MAX_IMPORT_ROWS} at a time.` };
  return { ok: true, rows };
}

export async function importContainers(rows: ContainerRow[], fetchFn: typeof fetch = fetch): Promise<{ ok: true; result: ContainerImportResult } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/containers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) }, fetchFn);
    const body = res.body as (ContainerImportResult & { error?: string }) | null;
    if (res.ok && typeof body?.added === 'number') return { ok: true, result: body };
    return { ok: false, message: (body?.error && EXPLAIN[body.error]) || `The server answered with status ${res.status}.` };
  } catch (e) {
    return failure(e);
  }
}

/** A short sentence for what an import did. */
export const importSummary = (r: ContainerImportResult) => `Import finished: ${r.added} added${r.rejectedCount ? `, ${r.rejectedCount} skipped` : ''}.`;
