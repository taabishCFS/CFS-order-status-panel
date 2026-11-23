// The Reports screen: each report is a spreadsheet the backend builds from the saved orders. Staff ask for a short-lived
// download link. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export type ReportKind = 'xero' | 'delivery' | 'outstanding';
export type PayTerms = 'credit' | 'proforma';

export interface ReportInfo {
  kind: ReportKind;
  title: string;
  description: string;
  needsDates: boolean;
  needsTerms: boolean;
}

export const REPORTS: ReportInfo[] = [
  {
    kind: 'xero',
    title: 'Xero VAT Invoice Report',
    description: 'One row per order placed in the dates you choose, ready to import into Xero. VAT is one sixth of the order total. Cancelled orders are left out.',
    needsDates: true,
    needsTerms: false,
  },
  {
    kind: 'outstanding',
    title: 'Outstanding Payments',
    description: 'Products we have not yet paid the supplier for, for brands paid on credit or pro-forma (set on Brand terms). Shows the Shopify cost per item times the quantity. Items whose supplier invoice is marked paid are left out.',
    needsDates: true,
    needsTerms: true,
  },
  {
    kind: 'delivery',
    title: 'Delivery Report',
    description: 'Orders that are ready to deliver: every product is in a delivery-ready status and nothing is owed. It does not use dates.',
    needsDates: false,
    needsTerms: false,
  },
];

export const TERMS_CHOICES: { value: PayTerms; label: string }[] = [
  { value: 'credit', label: 'Credit' },
  { value: 'proforma', label: 'Pro-forma' },
];

export interface ReportLink {
  url: string;
  filename: string;
}

const EXPLAIN: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can download reports.',
  bad_dates: 'Choose a start and end date (the start must not be after the end, and the range cannot be longer than a year).',
  bad_terms: 'Choose Credit or Pro-forma.',
  bad_request: 'That report is not available.',
};

/** Why the dates cannot be used, or null when they are fine. A quick check before asking the server. */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return 'Select Start & End Date.';
  if (from > to) return EXPLAIN.bad_dates;
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 366) return EXPLAIN.bad_dates;
  return null;
}

export async function loadReportLink(
  kind: ReportKind,
  range: { from: string; to: string } | null,
  fetchFn: typeof fetch = fetch,
  terms?: PayTerms,
): Promise<{ ok: true; data: ReportLink } | { ok: false; message: string }> {
  const query = (range ? `&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : '') + (terms ? `&terms=${terms}` : '');
  try {
    const res = await callBackendResult(`/api/report-link?kind=${kind}${query}`, undefined, fetchFn);
    const body = res.body as (ReportLink & { error?: string }) | null;
    if (res.ok && body?.url) return { ok: true, data: { url: body.url, filename: body.filename } };
    return { ok: false, message: (body?.error && EXPLAIN[body.error]) || `The server answered with status ${res.status}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
