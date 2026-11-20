// The verified staff member behind an online Shopify session, or null (offline session, no user).
// The library keeps the user in session.onlineAccessInfo.associated_user.
export function staffFromSession(session) {
  const user = session?.isOnline ? session.onlineAccessInfo?.associated_user : null;
  if (user?.id == null) return null;
  const full = [user.first_name, user.last_name].filter((p) => p && p.trim()).join(" ").trim();
  const name = full || user.email || "";
  if (!name) return null;
  return { id: String(user.id), name, source: "verified" };
}
