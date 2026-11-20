// The verified staff member behind an online Shopify session, or null (offline session, no user).
export function staffFromSession(session) {
  if (!session?.isOnline || session.userId == null) return null;
  const full = [session.firstName, session.lastName].filter((p) => p && p.trim()).join(" ").trim();
  const name = full || session.email || "";
  if (!name) return null;
  return { id: String(session.userId), name, source: "verified" };
}
