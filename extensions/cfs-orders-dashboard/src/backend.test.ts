import { describe, expect, it, vi } from 'vitest';
import { callBackend } from './backend';

const asFetch = (f: unknown) => f as unknown as typeof fetch;
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('callBackend', () => {
  it('resolves the JSON body on 200 and passes the path and init through', async () => {
    const f = vi.fn(async () => res(200, { shop: 's' }));
    expect(await callBackend('api/whoami', { method: 'GET' }, asFetch(f))).toEqual({ shop: 's' });
    expect(f).toHaveBeenCalledWith('api/whoami', { method: 'GET' });
  });

  it('throws an Error that names the status on 401', async () => {
    const f = vi.fn(async () => res(401));
    await expect(callBackend('api/whoami', undefined, asFetch(f))).rejects.toThrow(/401/);
  });
});
