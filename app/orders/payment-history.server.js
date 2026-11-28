// Payment History (legacy "balance_paid", titled Payment/Refund): every payment and refund taken on the shop, newest first.
// Read live from Shopify's shop-wide list of money movements (tenderTransactions), so nothing is stored here.
// The customer name comes from the order's billing (or shipping) address: the app has no permission to read customers.
export const PAGE_SIZE = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR = /^[A-Za-z0-9+/=_-]{1,512}$/;

const validDay = (s) => DAY.test(s ?? "") && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Reads ?from=&to=&after=&before= (days as YYYY-MM-DD, cursors from the previous page). */
export function parsePaymentParams(searchParams) {
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const after = searchParams.get("after") ?? "";
  const before = searchParams.get("before") ?? "";
  return {
    from: validDay(from) ? from : "",
    to: validDay(to) ? to : "",
    after: CURSOR.test(after) ? after : "",
    before: !CURSOR.test(after) && CURSOR.test(before) ? before : "",
  };
}

/** The Shopify search for the date range; both ends are whole days. */
export function paymentSearch({ from, to }) {
  const terms = [];
  if (from) terms.push(`processed_at:>=${from}T00:00:00Z`);
  if (to) terms.push(`processed_at:<=${to}T23:59:59Z`);
  return terms.join(" ");
}

const QUERY = `#graphql
  query CfsPaymentHistory($first: Int, $last: Int, $after: String, $before: String, $query: String) {
    tenderTransactions(first: $first, last: $last, after: $after, before: $before, query: $query, reverse: true) {
      nodes {
        id processedAt paymentMethod remoteReference test
        amount { amount currencyCode }
        order { id name email billingAddress { name } shippingAddress { name } }
      }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }`;

const METHODS = { credit_card: "Card", gift_card: "Gift card", other: "Other", unknown: "Unknown", cash: "Cash", paypal: "PayPal" };
export const payTypeLabel = (m) => (m ? METHODS[m] ?? m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

/** One transaction as a row; a negative amount is a refund. */
export function toPaymentRow(t) {
  const minor = Math.round(Number(t.amount?.amount ?? 0) * 100);
  return {
    id: t.id,
    orderId: t.order?.id ?? null,
    orderName: (t.order?.name ?? "").replace(/^#/, ""),
    reference: t.remoteReference ?? "",
    type: minor < 0 ? "Refund" : "Payment",
    amountMinor: minor,
    currency: t.amount?.currencyCode ?? "GBP",
    payType: payTypeLabel(t.paymentMethod),
    email: t.order?.email ?? "",
    customer: t.order?.billingAddress?.name || t.order?.shippingAddress?.name || "",
    date: t.processedAt ?? null,
    test: Boolean(t.test),
  };
}

/** { rows, hasNext, hasPrevious, next, previous, size }. Throws when Shopify answers with errors. */
export async function listPayments(graphql, params) {
  const variables = { query: paymentSearch(params) || null };
  if (params.before) Object.assign(variables, { last: PAGE_SIZE, before: params.before });
  else Object.assign(variables, { first: PAGE_SIZE, after: params.after || null });
  const body = await (await graphql(QUERY, { variables })).json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  const { nodes, pageInfo } = body.data.tenderTransactions;
  return {
    rows: nodes.map(toPaymentRow),
    hasNext: pageInfo.hasNextPage,
    hasPrevious: pageInfo.hasPreviousPage,
    next: pageInfo.hasNextPage ? pageInfo.endCursor : null,
    previous: pageInfo.hasPreviousPage ? pageInfo.startCursor : null,
    size: PAGE_SIZE,
  };
}
