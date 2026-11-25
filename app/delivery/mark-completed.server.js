// Mark Completed on the Delivery Booked page, done on the server: each order's status record gets Completed on the ticked lines (the same
// record and history the Order Detail page writes), the order's copy is refreshed, and the customer is emailed only when asked.
import { applyChange } from "../../extensions/cfs-order-status/src/state";
import { archiveEntries } from "../../extensions/cfs-order-status/src/archive";
import { commitChange } from "../../extensions/cfs-order-status/src/save";
import { loadState, saveState } from "../../extensions/cfs-order-status/src/store";
import { fetchOrder } from "../orders/fetch-order.server";
import { mapOrder } from "../orders/map-order";
import { upsertOrder } from "../orders/mirror.server";
import { queueOrderEmails } from "../email/queue-order-emails.server";
import statuses from "../../extensions/cfs-order-status/src/statuses.json";

export const COMPLETED = 6;
const COLLECTION_STATUS = 31;
const STALE = "Someone else changed this order. Open it and try again.";
const COMPLETED_STATUS = statuses.find((s) => s.id === COMPLETED);

// The store helpers talk to Shopify with `fetch("shopify:admin/api/graphql.json", ...)`; on the server the same call goes through admin.graphql.
const viaGraphql = (graphql) => async (_url, init) => {
  const { query, variables } = JSON.parse(init.body);
  return graphql(query, { variables });
};

const MAIL_PROBLEM = {
  email_off: "customer email is turned off",
  no_order: "the order has not been synced yet",
  nothing_to_send: "no email applies to this change",
};

/**
 * Sets Completed on the given lines. Returns { ok: true, saved: [{orderId, name}], failed: [{orderId, name, message}], emailed, emailProblems }
 * or { ok: false, code: "no_lines" }. One order failing never stops the others; an email that cannot be queued never undoes the status.
 * deps (for tests): { load, commit, sync, queue, now, newId }.
 */
export async function markCompleted(db, { shop, graphql, lineIds, email, actor, config, deps = {} }) {
  const fetchFn = viaGraphql(graphql);
  const load = deps.load ?? ((orderId) => loadState(orderId, fetchFn));
  const commit =
    deps.commit ??
    ((orderId, current, next, digest) =>
      commitChange(orderId, current, next, digest, { archive: (id, entries) => archiveEntries(id, entries, fetchFn), save: (id, state, d) => saveState(id, state, d, fetchFn) }));
  const sync = deps.sync ?? (async (orderId) => upsertOrder(db, mapOrder(shop, await fetchOrder(graphql, orderId))));
  const queue = deps.queue ?? ((args) => queueOrderEmails(db, args));
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const lines = await db.orderLine.findMany({ where: { shop, lineId: { in: lineIds } }, select: { lineId: true, orderId: true } });
  if (lines.length === 0) return { ok: false, code: "no_lines" };
  const groups = new Map();
  for (const l of lines) groups.set(l.orderId, [...(groups.get(l.orderId) ?? []), l.lineId]);
  const orders = await db.order.findMany({ where: { shop, orderId: { in: [...groups.keys()] } }, select: { orderId: true, name: true } });
  const nameOf = new Map(orders.map((o) => [o.orderId, o.name]));

  const result = { ok: true, saved: [], failed: [], emailed: 0, emailProblems: [] };
  for (const [orderId, ids] of groups) {
    const name = nameOf.get(orderId) ?? orderId;
    try {
      const loaded = await load(orderId);
      const current = await db.orderLine.findMany({ where: { shop, orderId, quantity: { gt: 0 } }, select: { lineId: true } });
      const allLineIds = [...new Set([...current.map((l) => l.lineId), ...ids])];
      const before = (id) => loaded.state.lines?.[id]?.statusId ?? null;
      const entryId = newId();
      const next = applyChange(loaded.state, { scope: "lines", lineIds: ids, status: COMPLETED_STATUS, actor, allLineIds, now: now(), entryId });
      const saved = await commit(orderId, loaded.state, next, loaded.digest);
      if (!saved.ok) {
        result.failed.push({ orderId, name, message: saved.reason === "stale" ? STALE : saved.message });
        continue;
      }
      result.saved.push({ orderId, name });
      await sync(orderId);
      if (!email) continue;
      const after = (id) => (ids.includes(id) ? COMPLETED : before(id));
      const sent = await queue({
        shop,
        orderId,
        actor,
        config,
        request: {
          statusId: COMPLETED,
          lineIds: ids,
          previousStatusByLine: Object.fromEntries(ids.map((id) => [id, before(id)])),
          collectionLineIds: allLineIds.filter((id) => after(id) === COLLECTION_STATUS),
          extras: {},
          lineExtras: {},
          idempotencyKey: entryId,
        },
      });
      if (!sent.ok) result.emailProblems.push(MAIL_PROBLEM[sent.code] ?? `the email could not be queued (${sent.code})`);
      else if (sent.rows.some((r) => r.kind === "customer" && r.recipient)) result.emailed += 1;
      else result.emailProblems.push(`${name} has no customer email address`);
    } catch (e) {
      result.failed.push({ orderId, name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ...result, text: completedText(result, email) };
}

/** The sentence shown after the save. */
export function completedText(r, email) {
  const n = r.saved.length;
  let text = `Marked Completed: ${n} order${n === 1 ? "" : "s"}.`;
  if (!email) text += " The customers were not emailed.";
  else {
    text += ` ${r.emailed} customer email${r.emailed === 1 ? "" : "s"} queued.`;
    const problems = [...new Set(r.emailProblems)];
    if (problems.length) text += ` Not emailed: ${problems.join("; ")}.`;
  }
  if (r.failed.length) text += ` Not saved: ${r.failed.map((f) => `${f.name}: ${f.message}`).join(" ")}`;
  return text;
}
