// The Feedback Calling page. Every call returns { ok: false, message } instead of throwing.
import { callBackendResult } from './backend';

export interface FeedbackRow {
  orderId: string; orderName: string; orderDate: string; completedDate: string | null; month: string; allocDate: string | null;
  callDate: string; staff: string; callStatus: string; remark: string; remark2: string; rating: string; ratingDate: string; updatedByName: string | null;
}
export interface FeedbackList { rows: FeedbackRow[]; total: number; page: number; pageCount: number; size: number; callers: string[]; from: string; to: string; capped: boolean }
export interface FeedbackQuery { from: string; to: string; q: string; staff: string; page: number; all: boolean }
export type CallField = 'callDate' | 'staff' | 'callStatus' | 'remark' | 'remark2' | 'rating' | 'ratingDate';

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const MESSAGES: Record<string, string> = {
  staff_not_verified: 'Only a verified staff member can change feedback calls.',
  bad_date: 'That is not a real date.',
  bad_staff: 'Choose a caller from the list.',
  too_long: 'That is too long (remarks up to 1,000 characters, rating up to 50).',
  not_found: 'That order or caller was not found. Press Refresh.',
  exists: 'That caller is already on the list.',
  bad_name: 'Type a name (up to 50 characters).',
  last_caller: 'Keep at least one caller on the list.',
  no_callers: 'Add a caller first.',
};
type Body = { error?: string; message?: string } | null;
const explain = (status: number, body: Body) => (body?.error && MESSAGES[body.error]) || body?.message || `The server answered with status ${status}.`;
const failure = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) });
const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function feedbackSearch({ from, to, q, staff, page, all }: FeedbackQuery): string {
  const s = new URLSearchParams();
  if (from) s.set('from', from);
  if (to) s.set('to', to);
  if (q.trim()) s.set('q', q.trim());
  if (staff) s.set('staff', staff);
  if (all) s.set('all', '1');
  else if (page > 1) s.set('page', String(page));
  return s.toString();
}

export async function loadFeedback(query: FeedbackQuery, fetchFn: typeof fetch = fetch): Promise<Result<FeedbackList>> {
  try {
    const res = await callBackendResult(`/api/feedback-calling?${feedbackSearch(query)}`, undefined, fetchFn);
    const b = res.body as (FeedbackList & Body) | null;
    return res.ok && Array.isArray(b?.rows) ? { ok: true, data: b as FeedbackList } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

async function send<T>(body: unknown, pick: (b: Record<string, unknown>) => T | null, fetchFn: typeof fetch): Promise<Result<T>> {
  try {
    const res = await callBackendResult('/api/feedback-calling', post(body), fetchFn);
    const b = res.body as (Record<string, unknown> & Body) | null;
    const data = res.ok && b ? pick(b) : null;
    return data !== null ? { ok: true, data } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}

export const saveCall = (orderId: string, field: CallField, value: string, fetchFn: typeof fetch = fetch) =>
  send({ orderId, field, value }, (b) => (b.ok === true ? true : null), fetchFn);

export const shareOutCalls = (query: FeedbackQuery, fetchFn: typeof fetch = fetch) =>
  send({ shareOut: { from: query.from, to: query.to, q: query.q } }, (b) => (typeof b.assigned === 'number' ? b.assigned : null), fetchFn);

export const addCaller = (name: string, fetchFn: typeof fetch = fetch) =>
  send({ add: name }, (b) => (Array.isArray(b.callers) ? (b.callers as string[]) : null), fetchFn);

export const removeCaller = (name: string, fetchFn: typeof fetch = fetch) =>
  send({ remove: name }, (b) => (Array.isArray(b.callers) ? (b.callers as string[]) : null), fetchFn);

/** A five-minute link to the CSV of the list as filtered. */
export async function feedbackLink(query: FeedbackQuery, fetchFn: typeof fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const q = new URLSearchParams(feedbackSearch({ ...query, page: 1, all: false }));
    q.set('kind', 'feedback-calling');
    const res = await callBackendResult(`/api/delivery-export?${q}`, undefined, fetchFn);
    const b = res.body as ({ url?: string } & Body) | null;
    return res.ok && typeof b?.url === 'string' ? { ok: true, data: { url: b.url } } : { ok: false, message: explain(res.status, b) };
  } catch (e) {
    return failure(e);
  }
}
