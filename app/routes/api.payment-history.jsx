import { listPayments, parsePaymentParams } from "../orders/payment-history.server";
import { authenticate } from "../shopify.server";

// GET ?from=&to=&after=&before=: one page of payments and refunds, read live from Shopify. Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { admin, cors } = await authenticate.admin(request);
  try {
    return cors(Response.json(await listPayments(admin.graphql, parsePaymentParams(new URL(request.url).searchParams))));
  } catch (error) {
    console.error("Payment History: Shopify read failed", error.message);
    return cors(Response.json({ message: "Shopify could not be read just now. Press Refresh to try again." }, { status: 502 }));
  }
};
