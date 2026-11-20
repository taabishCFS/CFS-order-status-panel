// Call the CFS Ops backend. Shopify resolves a relative path against the app URL and adds the session token.
export async function callBackend(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const res = await fetchImpl(path, init);
  if (!res.ok) throw new Error(`Backend ${path} failed with status ${res.status}`);
  return res.json();
}
