// Brand terms spreadsheet import (columns Brand and Terms), plus searching and paging the long brand list.
// Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import type { BrandTermsRow } from './brandTerms';

export interface ImportRow {
  line: number;
  brand: string;
  terms: string;
}

export interface ImportResult {
  saved: number;
  cleared: number;
  unchanged: number;
  rejected: { line: number | null; reason: string }[];
  rejectedCount: number;
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 1_000_000;

/** Split CSV text into rows of cells: quotes, doubled quotes, commas or semicolons, CRLF and a leading byte-order mark. */
export function splitCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/** The brands and terms in a spreadsheet saved as CSV. The first row must have the headings Brand and Terms (any order, any case). */
export function parseBrandTermsCsv(text: string): { ok: true; rows: ImportRow[] } | { ok: false; message: string } {
  const all = splitCsv(text);
  const header = (all[0] ?? []).map((h) => h.trim().toLowerCase());
  const brandAt = header.indexOf('brand');
  const termsAt = header.indexOf('terms');
  if (brandAt < 0 || termsAt < 0) return { ok: false, message: 'The first row must have the headings Brand and Terms. Download the brand list to see the layout.' };
  const rows: ImportRow[] = [];
  all.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return; // a blank line
    rows.push({ line: i + 2, brand: (cells[brandAt] ?? '').trim(), terms: (cells[termsAt] ?? '').trim() });
  });
  if (rows.length === 0) return { ok: false, message: 'The file has no brands in it.' };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `The file has ${rows.length} brands. Please import at most ${MAX_IMPORT_ROWS} at a time.` };
  return { ok: true, rows };
}

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change brand terms.',
  too_many_rows: `Please import at most ${MAX_IMPORT_ROWS} brands at a time.`,
  bad_request: 'That file could not be used.',
};

export async function importBrandTerms(rows: ImportRow[], fetchFn: typeof fetch = fetch): Promise<{ ok: true; result: ImportResult } | { ok: false; message: string }> {
  try {
    const res = await callBackendResult('/api/brand-terms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) }, fetchFn);
    const body = res.body as (ImportResult & { error?: string }) | null;
    if (res.ok && typeof body?.saved === 'number') return { ok: true, result: body };
    return { ok: false, message: (body?.error && EXPLAIN[body.error]) || `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** A short sentence for what an import did. */
export function importSummary(r: ImportResult): string {
  const parts = [`${r.saved} saved`];
  if (r.cleared) parts.push(`${r.cleared} cleared`);
  if (r.unchanged) parts.push(`${r.unchanged} left as they were (blank terms)`);
  if (r.rejectedCount) parts.push(`${r.rejectedCount} skipped`);
  return `Import finished: ${parts.join(', ')}.`;
}

export const PAGE_SIZE = 50;

/** The brands that contain the search words (any case), in the same order. */
export function filterBrands(rows: BrandTermsRow[], search: string): BrandTermsRow[] {
  const q = search.trim().toLowerCase();
  return q ? rows.filter((r) => r.brand.toLowerCase().includes(q)) : rows;
}

/** One page of a list: { items, page (kept in range), pageCount }. */
export function pageOf<T>(items: T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((at - 1) * size, at * size), page: at, pageCount };
}
