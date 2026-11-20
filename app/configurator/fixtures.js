// In-memory stand-in for the lineConfiguration table (the few calls versions.server.js uses).
export function fakeVersionsDb() {
  const rows = [];
  const find = (w) => rows.find((r) => r.shop === w.shop && r.lineItemId === w.lineItemId && r.version === w.version);
  return {
    rows,
    lineConfiguration: {
      // No await between the check and the insert, so two parallel callers cannot both insert.
      upsert: async ({ where, create }) => {
        const existing = find(where.shop_lineItemId_version);
        if (!existing) rows.push({ id: `r${rows.length + 1}`, createdAt: new Date(), reason: null, actorId: null, actorName: null, adjustment: null, ...create });
      },
      findMany: async ({ where }) => rows.filter((r) => r.shop === where.shop && r.orderId === where.orderId).sort((a, b) => a.version - b.version),
    },
  };
}
