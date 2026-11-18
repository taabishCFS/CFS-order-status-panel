// Reads ORderStatus.xlsx and writes extensions/cfs-order-status/src/statuses.json.
// Usage: node scripts/build-statuses.mjs [path-to-xlsx]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const DEFAULT_XLSX =
  'C:/Users/Admin/Documents/CFS2030/Migration/Orders-and-My-Account/ORderStatus.xlsx';
const EXPECTED_ROWS = 84;
const xlsx = process.argv[2] ?? DEFAULT_XLSX;
const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../extensions/cfs-order-status/src/statuses.json',
);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsx);
const ws = wb.worksheets[0];

const rows = [];
ws.eachRow((row, n) => {
  if (n === 1) return; // header: iOrderStatusId, vStatus
  const id = Number(row.getCell(1).value);
  const label = String(row.getCell(2).value ?? '');
  if (!Number.isInteger(id) || label.trim() === '') {
    throw new Error(`Row ${n}: bad id or empty label (${row.values})`);
  }
  rows.push({ id, label });
});

if (rows.length !== EXPECTED_ROWS) {
  console.error(`Expected ${EXPECTED_ROWS} statuses, found ${rows.length}`);
  process.exit(1);
}
if (new Set(rows.map((r) => r.id)).size !== rows.length) {
  console.error('Duplicate status IDs in workbook');
  process.exit(1);
}

writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
console.log(`Wrote ${rows.length} statuses to ${out}`);
