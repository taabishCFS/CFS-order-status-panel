// Which staff may do the restricted actions. The old system asked for a password; here each person has a tick-list instead.
// Until someone has been given "manage_permissions" nobody is restricted (so nothing breaks before the list is set up).

export const PERMISSIONS = [
  { key: "delivery_charges", label: "Change delivery and service charges", detail: "The Delivery & services box on an order." },
  { key: "refunds", label: "Work the refund list", detail: "Refunded, Save, Add Order and Remove on the Refund Orders List." },
  { key: "delivery_notes", label: "Print delivery notes", detail: "Print Delivery Note on an order." },
  { key: "process_order", label: "Process Order and chase suppliers", detail: "Process Order and Chase Up buttons: email the supplier and set Order in Progress." },
  { key: "manage_permissions", label: "Manage permissions", detail: "Open this page and change what other staff can do." },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const MANAGE = "manage_permissions";

/** Remember a verified staff member (name and last seen) so they can be listed on the permissions page. Returns their stored record. */
export async function recordStaff(db, shop, staff) {
  if (!staff?.id || !staff?.name) return null;
  return db.staffMember.upsert({
    where: { shop_staffId: { shop, staffId: staff.id } },
    create: { shop, staffId: staff.id, name: staff.name, lastSeenAt: new Date() },
    update: { name: staff.name, lastSeenAt: new Date() },
  });
}

/** Has anyone been given "manage_permissions"? Before that, nobody is restricted. */
export async function isRestricted(db, shop) {
  return (await db.staffMember.count({ where: { shop, keys: { has: MANAGE } } })) > 0;
}

/**
 * What this staff member may do: { restricted, keys, canManage }.
 * When nobody is restricted yet, everyone gets every permission. An unverified caller (null) gets nothing.
 */
export async function permissionsFor(db, shop, staff) {
  if (!staff?.id) return { restricted: false, keys: [], canManage: false };
  const restricted = await isRestricted(db, shop);
  if (!restricted) return { restricted: false, keys: [...PERMISSION_KEYS], canManage: true };
  const row = await db.staffMember.findFirst({ where: { shop, staffId: staff.id }, select: { keys: true } });
  const keys = (row?.keys ?? []).filter((k) => PERMISSION_KEYS.includes(k));
  return { restricted: true, keys, canManage: keys.includes(MANAGE) };
}

/** True when this staff member may do `key`. */
export async function can(db, shop, staff, key) {
  const p = await permissionsFor(db, shop, staff);
  return p.keys.includes(key);
}

/** Everyone who has opened the app, newest activity first, with their permissions. */
export async function listStaff(db, shop) {
  const rows = await db.staffMember.findMany({ where: { shop }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ staffId: r.staffId, name: r.name, keys: (r.keys ?? []).filter((k) => PERMISSION_KEYS.includes(k)), lastSeenAt: r.lastSeenAt?.toISOString?.() ?? null }));
}

/**
 * Set one person's permissions. Only a manager may do this (anyone, while nobody is restricted yet).
 * Returns { ok: true } or { ok: false, error }: "forbidden", "bad_request", "not_found", "last_manager" (it would leave nobody able to manage).
 */
export async function setStaffPermissions(db, shop, actor, staffId, keys) {
  const mine = await permissionsFor(db, shop, actor);
  if (!mine.canManage) return { ok: false, error: "forbidden" };
  if (typeof staffId !== "string" || !staffId || !Array.isArray(keys) || !keys.every((k) => PERMISSION_KEYS.includes(k))) return { ok: false, error: "bad_request" };
  const clean = [...new Set(keys)];
  const target = await db.staffMember.findFirst({ where: { shop, staffId } });
  if (!target) return { ok: false, error: "not_found" };
  if (mine.restricted && (target.keys ?? []).includes(MANAGE) && !clean.includes(MANAGE)) {
    const managers = await db.staffMember.count({ where: { shop, keys: { has: MANAGE } } });
    if (managers <= 1) return { ok: false, error: "last_manager" };
  }
  await db.staffMember.update({ where: { shop_staffId: { shop, staffId } }, data: { keys: clean, updatedBy: actor?.name ?? null } });
  return { ok: true };
}
