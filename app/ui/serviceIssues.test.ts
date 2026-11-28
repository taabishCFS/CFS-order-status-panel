import { describe, expect, it } from 'vitest';
import { issueSearch, saveIssue, uploadPhoto } from './serviceIssues';

const Q = { from: '2026-11-01', to: '2026-11-30', brand: '', takenBy: '', vendor: 'Beta', status: 'Open', q: '', page: 2, all: false };

describe('Service Issue Report calls', () => {
  it('builds the query', () => {
    expect(issueSearch(Q)).toBe('from=2026-11-01&to=2026-11-30&vendor=Beta&status=Open&page=2');
  });
  it('explains a refused save', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'bad_number' }), { status: 400 })) as typeof fetch;
    expect(await saveIssue(1, 'amount', 'x', f)).toEqual({ ok: false, message: 'Type a number (money up to 2 decimal places).' });
  });
  it('uploads a photo in three steps', async () => {
    const seen: string[] = [];
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(u));
      if (String(u).startsWith('https://up')) return new Response(null, { status: 204 });
      const body = JSON.parse(String(init?.body));
      if (body.stage) return new Response(JSON.stringify({ ok: true, target: { url: 'https://up.example/', resourceUrl: 'https://up.example/r', parameters: [{ name: 'key', value: 'k' }] } }));
      return new Response(JSON.stringify({ ok: true, photo: { id: 'gid://shopify/MediaImage/1', url: null } }));
    }) as typeof fetch;
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(await uploadPhoto(1, file, f)).toEqual({ ok: true, data: { id: 'gid://shopify/MediaImage/1', url: null } });
    expect(seen).toEqual(['/api/service-issues', 'https://up.example/', '/api/service-issues']);
  });
});
