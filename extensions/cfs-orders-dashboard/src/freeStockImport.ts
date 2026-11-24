// Free stock spreadsheet import: reads the CSV into rows and sends them to the server. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import { splitCsv } from './brandTermsImport';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2_000_000;

export interface FreeStockRow {
  line: number;
  itemType: string;
  sourceOrder: string;
  brand: string;
  productName: string;
  qty: string;
  productCode: string;
  warehouseCode: string;
  rma: string;
  remarks: string;
  cost: string;
  creditFoc: string;
  status: string;
  collection: string;
}

export interface FreeStockImportResult {
  added: number;
  rejected: { line: number | null; reason: string }[];
  rejectedCount: number;
}

// Headings are matched without case, spaces or punctuation. The old system's headings work too; columns we do not use are ignored.
const ALIASES: Record<keyof Omit<FreeStockRow, 'line'>, string[]> = {
  itemType: ['itemtype'],
  sourceOrder: ['sourceorder', 'orderno', 'order'],
  brand: ['brand', 'brandname'],
  productName: ['productname', 'item', 'name'],
  qty: ['qty', 'quantity'],
  productCode: ['productcode', 'code', 'sku'],
  warehouseCode: ['warehousecode', 'whscode', 'fwhscode'],
  rma: ['rma', 'frma'],
  remarks: ['remarks', 'notes'],
  cost: ['cost', 'itemcost', 'vcost'],
  creditFoc: ['creditfoc', 'credit'],
  status: ['status'],
  collection: ['collection'],
};
const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The stock rows in a spreadsheet saved as CSV. The first row must have headings, including Brand, Qty and Product Code. */
export function parseFreeStockCsv(text: string): { ok: true; rows: FreeStockRow[] } | { ok: false; message: string } {
  const all = splitCsv(text);
  const header = (all[0] ?? []).map(key);
  const at = {} as Record<keyof Omit<FreeStockRow, 'line'>, number>;
  for (const field of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) at[field] = header.findIndex((h) => ALIASES[field].includes(h));
  if (at.brand < 0 || at.qty < 0 || at.productCode < 0) return { ok: false, message: 'The first row must have the headings Brand, Qty and Product Code. Download the sample to see the layout.' };
  const cell = (cells: string[], field: keyof typeof ALIASES) => (at[field] >= 0 ? (cells[at[field]] ?? '').trim() : '');
  const rows: FreeStockRow[] = [];
  all.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return; // a blank line
    rows.push({
      line: i + 2,
      itemType: cell(cells, 'itemType'), sourceOrder: cell(cells, 'sourceOrder'), brand: cell(cells, 'brand'), productName: cell(cells, 'productName'),
      qty: cell(cells, 'qty'), productCode: cell(cells, 'productCode'), warehouseCode: cell(cells, 'warehouseCode'), rma: cell(cells, 'rma'),
      remarks: cell(cells, 'remarks'), cost: cell(cells, 'cost'), creditFoc: cell(cells, 'creditFoc'), status: cell(cells, 'status'), collection: cell(cells, 'collection'),
    });
  });
  if (rows.length === 0) return { ok: false, message: 'The file has no stock rows in it.' };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `The file has ${rows.length} rows. Please import at most ${MAX_IMPORT_ROWS} at a time.` };
  return { ok: true, rows };
}

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can import stock.',
  too_many_rows: `Please import at most ${MAX_IMPORT_ROWS} rows at a time.`,
  bad_request: 'That file could not be used.',
};

export async function importFreeStock(rows: FreeStockRow[], fetchFn: typeof fetch = fetch): Promise<{ ok: true; result: FreeStockImportResult } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/free-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) }, fetchFn);
    const body = res.body as (FreeStockImportResult & { error?: string }) | null;
    if (res.ok && typeof body?.added === 'number') return { ok: true, result: body };
    return { ok: false, message: (body?.error && EXPLAIN[body.error]) || `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** A short sentence for what an import did. */
export function importSummary(r: FreeStockImportResult): string {
  return `Import finished: ${r.added} added${r.rejectedCount ? `, ${r.rejectedCount} skipped` : ''}.`;
}
