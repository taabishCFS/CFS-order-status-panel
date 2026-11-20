// In-memory stand-in for the lineConfiguration table (the few calls the configurator code uses).
export function fakeVersionsDb() {
  const rows = [];
  const find = (w) => rows.find((r) => r.shop === w.shop && r.lineItemId === w.lineItemId && r.version === w.version);
  const defaults = () => ({ id: `r${rows.length + 1}`, createdAt: new Date(), reason: null, actorId: null, actorName: null, adjustment: null });
  const db = {
    rows,
    failNextUpdate: false,
    lineConfiguration: {
      // No await between the check and the insert, so two parallel callers cannot both insert.
      upsert: async ({ where, create }) => {
        if (!find(where.shop_lineItemId_version)) rows.push({ ...defaults(), ...create });
      },
      // Like Prisma: a second row with the same shop, line and version is refused with code P2002.
      create: async ({ data }) => {
        if (find(data)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        const row = { ...defaults(), ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        if (db.failNextUpdate) {
          db.failNextUpdate = false;
          throw new Error("database unavailable");
        }
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }) =>
        rows
          .filter((r) => r.shop === where.shop && r.orderId === where.orderId && (!where.status || r.status === where.status))
          .sort((a, b) => a.version - b.version),
    },
  };
  return db;
}
