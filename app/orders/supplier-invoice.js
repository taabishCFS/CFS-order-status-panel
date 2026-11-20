// Pure rules for the supplier invoice details kept per order line (date, number, amount, paid).
const LINE_ID = /^gid:\/\/shopify\/LineItem\/\d{1,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;
const MAX_NUMBER = 60;
const bad = { error: "bad_request" };

const realDate = (v) => DATE.test(v) && new Date(`${v}T00:00:00.000Z`).toISOString().startsWith(v);

/** Reads the JSON a browser sends. Returns { value: { lineId, invoiceDate, invoiceNumber, amountMinor, paid } } or { error }. */
export function readInvoiceInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad;
  const { lineId, invoiceDate, invoiceNumber, amount, paid } = body;
  if (typeof lineId !== "string" || !LINE_ID.test(lineId)) return bad;
  if (typeof paid !== "boolean") return bad;

  const date = invoiceDate === undefined || invoiceDate === null ? "" : invoiceDate;
  if (typeof date !== "string" || (date !== "" && !realDate(date))) return bad;

  const number = invoiceNumber === undefined || invoiceNumber === null ? "" : invoiceNumber;
  if (typeof number !== "string" || number.trim().length > MAX_NUMBER) return bad;

  const rawAmount = amount === undefined || amount === null ? "" : amount;
  if (typeof rawAmount !== "string" && typeof rawAmount !== "number") return bad;
  const cleaned = String(rawAmount).replace(/[£,\s]/g, "");
  if (cleaned !== "" && !AMOUNT.test(cleaned)) return bad;

  return {
    value: {
      lineId,
      invoiceDate: date || null,
      invoiceNumber: number.trim() || null,
      amountMinor: cleaned === "" ? null : Math.round(Number(cleaned) * 100),
      paid,
    },
  };
}

export const isEmptyInvoice = (i) => i.invoiceDate === null && i.invoiceNumber === null && i.amountMinor === null && !i.paid;
