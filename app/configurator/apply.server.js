// Changing the options of a configured order line.
// The configurator prices every selection; Shopify only carries the price difference (an extra item
// for an increase, a line discount for a decrease). Each change is a saved version: written as
// "pending" before Shopify is touched, then "applied" or "failed", so a half-finished change can
// always be told apart and settled.
import { ConfiguratorError } from "./client.server";
import { currentConfiguration } from "./versions.server";
import { editOrder, findEdit, loadOrderState, markerFor, OrderEditError } from "../orders/order-edit.server";

const defaultEdit = { loadOrderState, editOrder, findEdit };
const PENDING_GRACE_MS = 60_000;

const keyOf = (id, quantity) => `${id}:${quantity}`;
const sameOptions = (current, quoteLines) => {
  const a = (current?.options ?? []).map((o) => keyOf(o.cfsId, o.quantity)).sort();
  const b = quoteLines.map((l) => keyOf(l.choiceId, l.quantity)).sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
};

/**
 * Prices a new selection for a saved line. The product and variant come from the saved line, never
 * from the caller. Returns { ok: true, ... } or { ok: false, outcome, message }.
 * ConfiguratorError other than the engine's own refusal (422) is thrown.
 */
export async function previewChange({ db, call, shop, orderId, lineItemId, choiceIds, quantities }) {
  const { lines } = await currentConfiguration(db, call, { shop, orderId });
  const line = lines.find((l) => l.lineItemId === lineItemId);
  if (!line) return { ok: false, outcome: "not_editable", message: "line_not_found" };
  if (!line.editable) return { ok: false, outcome: "not_editable", message: line.reason };

  let quote;
  try {
    quote = await call({
      shop,
      path: "/staff/quote",
      method: "POST",
      body: { productId: line.productId, variantId: line.variantId, choiceIds, quantities },
    });
  } catch (error) {
    if (error instanceof ConfiguratorError && error.status === 422) return { ok: false, outcome: "invalid", message: error.code };
    throw error;
  }

  const newUnitMinor = quote.totalCents;
  return {
    ok: true,
    line,
    version: line.version,
    currentUnitMinor: line.unitMinor,
    newUnitMinor,
    deltaMinor: (newUnitMinor - line.unitMinor) * line.quantity,
    same: sameOptions(line.configuration, quote.lines),
    configuration: {
      baseCents: quote.baseCents,
      unitCents: newUnitMinor,
      options: quote.lines.map((l) => ({ group: l.group, label: l.label, cfsId: l.choiceId, assignmentId: l.assignmentId ?? null, quantity: l.quantity, cents: l.cents })),
    },
    quote,
  };
}

/**
 * Settles changes left "pending" for over a minute (a crash between Shopify and the database):
 * applied if Shopify carries the change's marker, failed if not. Does nothing if Shopify cannot be read.
 */
export async function settlePending({ db, graphql, shop, orderId, edit = defaultEdit, now = Date.now }) {
  const pending = await db.lineConfiguration.findMany({ where: { shop, orderId, status: "pending" }, orderBy: { version: "asc" } });
  for (const row of pending) {
    if (now() - new Date(row.createdAt).getTime() < PENDING_GRACE_MS) continue;
    let found;
    try {
      found = await edit.findEdit(graphql, { orderId, marker: markerFor(row.lineItemId, row.version) });
    } catch (error) {
      console.error("Settle pending: could not read Shopify", error?.message);
      continue;
    }
    await db.lineConfiguration.update({
      where: { id: row.id },
      data: found
        ? { status: "applied", adjustment: row.adjustment ?? { kind: "recovered", amountMinor: Math.abs(row.deltaMinor), currency: null } }
        : { status: "failed", adjustment: { error: "not applied in Shopify" } },
    });
  }
}

/**
 * Applies a staff change. Returns { outcome, ... }: applied | unchanged | stale | invalid |
 * not_editable | failed. Never throws for an expected refusal.
 */
export async function applyConfiguration({
  db, graphql, call, staff, shop, orderId, lineItemId, expectedVersion, choiceIds, quantities, reason,
  edit = defaultEdit, now = Date.now,
}) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) return { outcome: "invalid", message: "reason_required" };

  try {
    await settlePending({ db, graphql, shop, orderId, edit, now });

    const preview = await previewChange({ db, call, shop, orderId, lineItemId, choiceIds, quantities });
    if (!preview.ok) return { outcome: preview.outcome, message: preview.message };
    if (preview.version !== expectedVersion) return { outcome: "stale" };
    if (preview.same) return { outcome: "unchanged" };

    const state = await edit.loadOrderState(graphql, orderId);
    if (state.cancelledAt) return { outcome: "not_editable", message: "order_cancelled" };
    const lineState = state.lines[lineItemId];
    if (!lineState) return { outcome: "not_editable", message: "line_not_found" };
    if (lineState.unfulfilledQuantity < lineState.quantity) return { outcome: "not_editable", message: "line_fulfilled" };

    const version = Math.max(...preview.line.history.map((h) => h.version)) + 1;
    const { deltaMinor } = preview;
    const base = {
      shop, orderId, lineItemId, version, source: "staff",
      configuration: preview.configuration, unitMinor: preview.newUnitMinor, deltaMinor,
      reason: why, actorId: staff.id, actorName: staff.name,
    };

    // A price-neutral change is only a record: nothing to post to Shopify.
    if (deltaMinor === 0) {
      try {
        await db.lineConfiguration.create({ data: { ...base, status: "applied", adjustment: null } });
      } catch (error) {
        if (error?.code === "P2002") return { outcome: "stale" };
        throw error;
      }
      return { outcome: "applied", version, deltaMinor };
    }

    // Written first, so a crash after Shopify commits still leaves a trace to settle.
    let row;
    try {
      row = await db.lineConfiguration.create({ data: { ...base, status: "pending", adjustment: null } });
    } catch (error) {
      if (error?.code === "P2002") return { outcome: "stale" };
      throw error;
    }

    const marker = markerFor(lineItemId, version);
    const summary = preview.configuration.options.map((o) => `${o.group}: ${o.label}`).join(", ");
    let posted;
    try {
      posted = await edit.editOrder(graphql, {
        orderId, lineItemId, lineQuantity: preview.line.quantity, deltaMinor, currency: state.currency, marker,
        title: `Configuration change v${version}: ${summary}`,
        note: `Configuration change by ${staff.name} (v${version}): ${why}.`,
      });
    } catch (error) {
      console.error("Apply configuration: Shopify edit failed", error?.message);
      const message = error instanceof OrderEditError ? error.message : "Shopify edit failed";
      await db.lineConfiguration.update({ where: { id: row.id }, data: { status: "failed", adjustment: { error: message } } }).catch(() => {});
      return { outcome: "failed", message };
    }

    try {
      await db.lineConfiguration.update({ where: { id: row.id }, data: { status: "applied", adjustment: posted.adjustment } });
    } catch (error) {
      // Shopify has the change; the row stays pending and settlePending finishes it from the marker.
      console.error("Apply configuration: change posted but not marked applied", error?.message);
      return { outcome: "applied", version, deltaMinor, warning: "record_pending" };
    }
    return { outcome: "applied", version, deltaMinor };
  } catch (error) {
    if (error instanceof ConfiguratorError) return { outcome: "failed", message: `configurator_${error.code}` };
    if (error instanceof OrderEditError) return { outcome: "failed", message: error.message };
    throw error;
  }
}
