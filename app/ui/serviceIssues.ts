// The Service Issue Report page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface Photo { id: string; url: string | null }
export interface IssueRow {
  id: number; vendor: string | null; orderId: string | null; photos: Photo[]; updatedByName: string | null;
  [field: string]: unknown;
}
export interface IssueList { rows: IssueRow[]; total: number; page: number; pageCount: number; size: number; brands: string[]; takers: string[]; vendors: string[]; capped: boolean }
export interface IssueQuery { from: string; to: string; brand: string; takenBy: string; vendor: string; status: string; q: string; page: number; all: boolean }

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const MESSAGES: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change service issues.',
  bad_date: 'That is not a real date.',
  bad_number: 'Type a number (money up to 2 decimal places).',
  too_long: 'That is too long.',
  item_needed: 'Type the Item.',
  not_found: 'That service issue was not found. Press Refresh.',
  not_image: 'Only photos can be added (JPG, PNG, GIF, WEBP or HEIC).',
  too_big: 'That photo is bigger than 20 MB.',
  photo_limit: 'An issue can have up to 5 photos. Remove one first.',
};
type Body = { error?: string; message?: string } | null;
const explain = (status: number, b: Body) => (b?.error && MESSAGES[b.error]) || b?.message || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });
const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function issueSearch(q: IssueQuery): string {
  const s = new URLSearchParams();
  for (const k of ['from', 'to', 'brand', 'takenBy', 'vendor', 'status', 'q'] as const) if (String(q[k]).trim()) s.set(k, String(q[k]).trim());
  if (q.all) s.set('all', '1');
  else if (q.page > 1) s.set('page', String(q.page));
  return s.toString();
}

export async function loadIssues(q: IssueQuery, fetchFn: typeof fetch = fetch): Promise<Result<IssueList>> {
  try {
    const res = await callBackendResult(`/api/service-issues?${issueSearch(q)}`, undefined, fetchFn);
    const b = res.body as (IssueList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as IssueList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function send(body: unknown, fetchFn: typeof fetch): Promise<Result<Record<string, unknown>>> {
  try {
    const res = await callBackendResult('/api/service-issues', post(body), fetchFn);
    const b = res.body as (Record<string, unknown> & Body) | null;
    return res.ok && b?.ok === true ? { ok: true, data: b } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const addIssue = (fields: Record<string, string>, fetchFn: typeof fetch = fetch) => send({ add: fields }, fetchFn);
export const saveIssue = (id: number, field: string, value: string, fetchFn: typeof fetch = fetch) => send({ id, field, value }, fetchFn);
export const deletePhoto = (id: number, fileId: string, fetchFn: typeof fetch = fetch) => send({ removePhoto: { id, fileId } }, fetchFn);

/** Uploads one photo: Shopify gives an upload place, the browser sends the file there, then it is added to the issue. */
export async function uploadPhoto(id: number, file: File, fetchFn: typeof fetch = fetch): Promise<Result<Photo>> {
  const staged = await send({ stage: { id, filename: file.name, mimeType: file.type, size: file.size } }, fetchFn);
  if (!staged.ok) return staged;
  const target = staged.data.target as { url: string; resourceUrl: string; parameters: { name: string; value: string }[] };
  try {
    const form = new FormData();
    for (const p of target.parameters) form.append(p.name, p.value);
    form.append('file', file);
    const up = await fetchFn(target.url, { method: 'POST', body: form });
    if (!up.ok) return { ok: false, message: `The photo could not be uploaded (status ${up.status}). Try again.` };
  } catch (e) {
    return failure(e);
  }
  const done = await send({ attach: { id, resourceUrl: target.resourceUrl, filename: file.name } }, fetchFn);
  return done.ok ? { ok: true, data: done.data.photo as Photo } : done;
}

export async function issuesLink(q: IssueQuery, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const s = new URLSearchParams(issueSearch({ ...q, page: 1, all: false }));
    s.set('kind', 'service-issues');
    const res = await callBackendResult(`/api/delivery-export?${s}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
