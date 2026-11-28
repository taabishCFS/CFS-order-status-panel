import { listPayments, parsePaymentParams } from "../orders/payment-history.server";
import { authenticate } from "../shopify.server";

// GET ?from=&to=&after=&before=: one page of payments and refunds, read live from Shopify. Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { admin, cors } = await authenticate.admin(request);
  try {
    return cors(Response.json(await listPayments(admin.graphql, parsePaymentParams(new URL(request.url).searchParams))));
  } catch (error) {
    // admin.graphql throws its own error with Shopify's messages in body.errors; show them so a refusal can be traced.
    const reason = error.body?.errors?.graphQLErrors?.map((e) => e.message).join("; ") || error.message;
    console.error("Payment History: Shopify read failed", reason);
    return cors(Response.json({ message: `Shopify could not be read just now (${String(reason).slice(0, 300)}). Press Refresh to try again.` }, { status: 502 }));
  }
};
