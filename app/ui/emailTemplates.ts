// Pure helpers for the Email templates screen. The backend is the authority on what is valid; these only
// give instant feedback while typing and turn its answers into plain words.

export interface Placeholders {
  order: string[];
  line: string[];
  layout: string[];
}

const TAG = /\{\{\s*([#/]?)\s*([A-Za-z0-9_]+)\s*\}\}/g;

// Placeholder names used in the text that are not in the allowed lists. The lines block markers are fine.
export function unknownPlaceholders(text: string, allowed: Placeholders): string[] {
  const known = new Set([...allowed.order, ...allowed.line, ...allowed.layout]);
  const unknown: string[] = [];
  for (const match of text.matchAll(TAG)) {
    const [, marker, name] = match;
    if (marker) continue;
    if (!known.has(name) && !unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

export function canSaveTemplate(args: { subject: string; body: string; reason: string; saving: boolean; changed: boolean; isLayout?: boolean }): boolean {
  const { subject, body, reason, saving, changed, isLayout = false } = args;
  if (saving || !changed) return false;
  if (!body.trim() || !reason.trim()) return false;
  return isLayout || Boolean(subject.trim());
}

export interface VersionRow {
  version: number;
  actorName: string | null;
  createdAt: string;
  reason: string | null;
}

export function describeVersion(v: VersionRow): string {
  const when = new Date(v.createdAt).toLocaleString('en-GB');
  const who = v.actorName ?? 'Imported';
  return `Version ${v.version} · ${when} · ${who}${v.reason ? ` · ${v.reason}` : ''}`;
}

const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', ndash: '–', mdash: '—', eacute: 'é', copy: '©', apos: "'" };

// A readable version of an email for the preview: layout and colours are not shown, the words are.
export function htmlToLines(html: string): string[] {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

export function templateError(status: number, body: { errors?: string[]; code?: string; error?: string } | null): string {
  if (body?.errors?.length) return body.errors.join(' ');
  switch (body?.code ?? body?.error) {
    case 'stale':
      return 'Someone else changed this template. Reload it to see the latest before saving again.';
    case 'email_off':
      return 'Customer email is turned off on the backend, so a test cannot be sent.';
    case 'no_allowlist':
      return 'No test addresses are set on the backend (MAIL_TEST_ALLOWLIST), so a test cannot be sent.';
    case 'staff_not_verified':
      return 'Shopify did not say who is signed in. A verified staff member is needed to change templates.';
    case 'not_found':
      return 'That template or version was not found.';
    default:
      return `The request failed (${status}).`;
  }
}
