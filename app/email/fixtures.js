// In-memory stand-in for the emailOutbox table (the few calls the email code uses), for tests.
// `where` supports equality plus { in }, { lt }, { lte }, { gte }.
const matches = (row, where = {}) =>
  Object.entries(where).every(([key, want]) => {
    const have = row[key];
    if (want && typeof want === "object" && !(want instanceof Date)) {
      if ("in" in want && !want.in.includes(have)) return false;
      if ("lt" in want && !(have < want.lt)) return false;
      if ("lte" in want && !(have <= want.lte)) return false;
      if ("gte" in want && !(have >= want.gte)) return false;
      return true;
    }
    return have === want;
  });

export function fakeOutboxDb() {
  const rows = [];
  const defaults = () => ({
    id: `e${rows.length + 1}`, createdAt: new Date(), status: "queued", attempts: 0, nextAttemptAt: new Date(),
    mode: null, providerId: null, error: null, sentAt: null, claimedAt: null, replyTo: null, actorId: null, actorName: null,
  });
  return {
    rows,
    emailOutbox: {
      // No await between the check and the insert, so two parallel callers cannot both insert.
      create: async ({ data }) => {
        if (rows.some((r) => r.shop === data.shop && r.dedupeKey === data.dedupeKey)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const row = { ...defaults(), ...data };
        rows.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take } = {}) => {
        let found = rows.filter((r) => matches(r, where));
        if (orderBy?.createdAt === "asc") found = found.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        if (orderBy?.createdAt === "desc") found = found.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
        return take ? found.slice(0, take) : found;
      },
      findFirst: async ({ where }) => rows.find((r) => matches(r, where)) ?? null,
      count: async ({ where }) => rows.filter((r) => matches(r, where)).length,
      updateMany: async ({ where, data }) => {
        const found = rows.filter((r) => matches(r, where));
        found.forEach((r) => Object.assign(r, data));
        return { count: found.length };
      },
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  };
}

export const draft = (over = {}) => ({
  shop: "s.myshopify.com", orderId: "gid://shopify/Order/1", orderName: "#1001", templateKey: "status.3", templateVersion: 1,
  kind: "customer", recipient: "cust@example.com", from: "CS <cs@x.com>", replyTo: "cs@x.com",
  subject: "Order in Progress", html: "<p>Hi</p>", actorId: "9", actorName: "Sam Patel", dedupeKey: "k1:save:customer", ...over,
});

// In-memory stand-in for the emailTemplate, emailTemplateVersion and emailSite tables.
export function fakeTemplatesDb() {
  const templates = [];
  const versions = [];
  const sites = [];
  const dup = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const db = {
    templates, versions, sites,
    $transaction: async (fn) => fn(db),
    emailTemplate: {
      findMany: async ({ where }) => templates.filter((t) => t.shop === where.shop).sort((a, b) => a.key.localeCompare(b.key)),
      findUnique: async ({ where: { shop_key } }) => templates.find((t) => t.shop === shop_key.shop && t.key === shop_key.key) ?? null,
      create: async ({ data }) => {
        if (templates.some((t) => t.shop === data.shop && t.key === data.key)) throw dup();
        const row = { id: `t${templates.length + 1}`, updatedAt: new Date(), updatedById: null, updatedByName: null, ...data };
        templates.push(row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const found = templates.filter((t) => t.shop === where.shop && t.key === where.key && t.version === where.version);
        found.forEach((t) => Object.assign(t, data, { updatedAt: new Date() }));
        return { count: found.length };
      },
    },
    emailTemplateVersion: {
      findMany: async ({ where }) => versions.filter((v) => v.shop === where.shop && v.key === where.key).sort((a, b) => b.version - a.version),
      findUnique: async ({ where: { shop_key_version } }) =>
        versions.find((v) => v.shop === shop_key_version.shop && v.key === shop_key_version.key && v.version === shop_key_version.version) ?? null,
      create: async ({ data }) => {
        if (versions.some((v) => v.shop === data.shop && v.key === data.key && v.version === data.version)) throw dup();
        const row = { id: `v${versions.length + 1}`, createdAt: new Date(), actorId: null, actorName: null, reason: null, ...data };
        versions.push(row);
        return row;
      },
    },
    emailSite: {
      findMany: async ({ where }) => sites.filter((s) => s.shop === where.shop),
      findUnique: async ({ where: { shop_code } }) => sites.find((s) => s.shop === shop_code.shop && s.code === shop_code.code) ?? null,
      create: async ({ data }) => {
        if (sites.some((s) => s.shop === data.shop && s.code === data.code)) throw dup();
        const row = { id: `s${sites.length + 1}`, ...data };
        sites.push(row);
        return row;
      },
    },
  };
  return db;
}

// Outbox + templates + the order mirror, for the code that queues order emails.
export function fakeEmailDb({ order, lines = [] } = {}) {
  const outbox = fakeOutboxDb();
  const templates = fakeTemplatesDb();
  const orders = order ? [order] : [];
  return {
    ...outbox,
    ...templates,
    $transaction: async (fn) => fn(templates),
    order: { findUnique: async ({ where: { shop_orderId } }) => orders.find((o) => o.shop === shop_orderId.shop && o.orderId === shop_orderId.orderId) ?? null },
    orderLine: { findMany: async ({ where }) => lines.filter((l) => l.shop === where.shop && l.orderId === where.orderId) },
  };
}
