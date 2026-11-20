// Reads and saves the supplier invoice details kept per order line. App-owned: Shopify has no such field.
import { isEmptyInvoice } from "./supplier-invoice.js";

const shape = (r) => ({
  invoiceDate: r.invoiceDate,
  invoiceNumber: r.invoiceNumber,
  amountMinor: r.amountMinor,
  paid: r.paid,
  updatedByName: r.updatedByName,
  updatedAt: r.updatedAt.toISOString(),
});

/** { [lineId]: { invoiceDate, invoiceNumber, amountMinor, paid, updatedByName, updatedAt } } for one order. */
export async function getSupplierInvoices(db, shop, orderId) {
  const rows = await db.lineSupplierInvoice.findMany({ where: { shop, orderId } });
  return Object.fromEntries(rows.map((r) => [r.lineId, shape(r)]));
}

/** @returns {Promise<{ok:true,invoice:object|null}|{ok:false,code:"no_line"}>} A blank, unpaid invoice removes the record. */
export async function saveSupplierInvoice(db, { shop, orderId, input, actor }) {
  const line = await db.orderLine.findFirst({ where: { shop, orderId, lineId: input.lineId } });
  if (!line) return { ok: false, code: "no_line" };

  if (isEmptyInvoice(input)) {
    await db.lineSupplierInvoice.deleteMany({ where: { shop, lineId: input.lineId } });
    return { ok: true, invoice: null };
  }
  const fields = { invoiceDate: input.invoiceDate, invoiceNumber: input.invoiceNumber, amountMinor: input.amountMinor, paid: input.paid, updatedById: actor.id, updatedByName: actor.name };
  const saved = await db.lineSupplierInvoice.upsert({
    where: { shop_lineId: { shop, lineId: input.lineId } },
    create: { shop, orderId, lineId: input.lineId, ...fields },
    update: fields,
  });
  return { ok: true, invoice: shape(saved) };
}
