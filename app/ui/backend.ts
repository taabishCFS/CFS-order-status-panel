// Call the CFS Ops backend. The page is served by the same server, so the path is made absolute (pages sit at
// different depths) and App Bridge adds the session token to the request.
const absolute = (path: string) => (path.startsWith('/') ? path : `/${path}`);

export async function callBackend(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const res = await fetchImpl(absolute(path), init);
  if (!res.ok) throw new Error(`Backend ${path} failed with status ${res.status}`);
  return res.json();
}

export interface BackendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

// Like callBackend, but a refusal (409, 422, 502...) is returned with its JSON body instead of thrown,
// for calls whose answer explains itself. Only a network failure throws.
export async function callBackendResult(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<BackendResult> {
  const res = await fetchImpl(absolute(path), init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}
