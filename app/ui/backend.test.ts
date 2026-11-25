import { describe, expect, it, vi } from 'vitest';
import { callBackend, callBackendResult } from './backend';

const asFetch = (f: unknown) => f as unknown as typeof fetch;
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('callBackend', () => {
  it('resolves the JSON body on 200 and passes the path and init through', async () => {
    const f = vi.fn(async () => res(200, { shop: 's' }));
    expect(await callBackend('api/whoami', { method: 'GET' }, asFetch(f))).toEqual({ shop: 's' });
    expect(f).toHaveBeenCalledWith('/api/whoami', { method: 'GET' });
  });

  it('throws an Error that names the status on 401', async () => {
    const f = vi.fn(async () => res(401));
    await expect(callBackend('api/whoami', undefined, asFetch(f))).rejects.toThrow(/401/);
  });
});

describe('paths', () => {
  it('makes a relative path absolute so it works from any page depth, and leaves an absolute one alone', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await callBackend('api/a', undefined, asFetch(f));
    await callBackend('/api/b', undefined, asFetch(f));
    expect(f.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['/api/a', '/api/b']);
  });
});

describe('callBackendResult', () => {
  it('returns the status and body for a refusal instead of throwing', async () => {
    const f = vi.fn(async () => res(409, { outcome: 'stale' }));
    expect(await callBackendResult('api/lines/configuration', { method: 'POST' }, asFetch(f))).toEqual({ ok: false, status: 409, body: { outcome: 'stale' } });
  });

  it('returns ok with the body on 200', async () => {
    const f = vi.fn(async () => res(200, { outcome: 'applied' }));
    expect(await callBackendResult('api/x', undefined, asFetch(f))).toEqual({ ok: true, status: 200, body: { outcome: 'applied' } });
  });

  it('gives a null body when the response is not JSON', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }) as unknown as Response);
    expect(await callBackendResult('api/x', undefined, asFetch(f))).toEqual({ ok: false, status: 502, body: null });
  });

  it('lets a network failure throw', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(callBackendResult('api/x', undefined, asFetch(f))).rejects.toThrow(/fetch failed/);
  });
});
