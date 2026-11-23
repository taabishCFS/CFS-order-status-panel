// Remembers who opened an order last. Opening returns the previous opener (so a staff member sees who had it before them) and records this one.
export async function recordOpen(db, { shop, orderId, staff, now = new Date() }) {
  const key = { shop_orderId: { shop, orderId } };
  const before = await db.orderOpen.findUnique({ where: key });
  await db.orderOpen.upsert({
    where: key,
    create: { shop, orderId, staffId: staff.id, staffName: staff.name, openedAt: now },
    update: { staffId: staff.id, staffName: staff.name, openedAt: now },
  });
  return before ? { name: before.staffName, at: before.openedAt.toISOString() } : null;
}
