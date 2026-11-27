// Supplier Sales Summary (old Downloads menu). Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';
import { type Preset, presetRange } from './orderReports';

export interface SalesOrder {
  orderId: string; name: string; createdAt: string; status: string; qty: number; saleMinor: number;
  parts: { label: string; minor: number }[]; grandMinor: number; split: boolean; diffMinor: number;
}
export interface SalesBrand { brand: string; store: boolean; saleMinor: number; grandMinor: number; units: number; orders?: SalesOrder[] }
export interface SalesSite { site: string; label: string; brands: SalesBrand[]; totals: { saleMinor: number; grandMinor: number; units: number } }
export interface SupplierSalesData { from: string; to: string; detail: boolean; sites: SalesSite[]; capped: boolean }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
interface Body { error?: string; message?: string }

export async function loadSupplierSales(from: string, to: string, detail: boolean, fetchFn: typeof fetch = fetch): Promise<Result<SupplierSalesData>> {
  try {
    const q = new URLSearchParams({ from, to });
    if (detail) q.set('detail', '1');
    const res = await callBackendResult(`/api/supplier-sales?${q}`, undefined, fetchFn);
    const b = res.body as (SupplierSalesData & Body) | null;
    return res.ok && Array.isArray(b?.sites) ? { ok: true, data: b as SupplierSalesData } : { ok: false, message: b?.message ?? `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** The old page's shortcuts (named as there) and the matching range. */
export const SHORTCUTS: [string, Preset][] = [['Today', 'Today'], ['Yesterday', 'Yesterday'], ['This Month', 'Current Month'], ['Last Month', 'Previous Month'], ['This Year', 'Current Year'], ['Last Year', 'Previous Year']];
export const shortcutRange = (preset: Preset, today: string) => presetRange(preset, today);

export type SortKey = 'brand' | 'sale' | 'grand' | 'units';
/** Brands sorted by a column, as the old page's clickable headings. */
export function sortBrands(brands: SalesBrand[], key: SortKey, asc: boolean): SalesBrand[] {
  const value = (b: SalesBrand) => (key === 'sale' ? b.saleMinor : key === 'grand' ? b.grandMinor : b.units);
  const sorted = [...brands].sort((a, b) => (key === 'brand' ? a.brand.localeCompare(b.brand) : value(a) - value(b)));
  return asc ? sorted : sorted.reverse();
}
