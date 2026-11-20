import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// Who is calling: the shop and the verified staff member from the session token.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  // TEMP diagnostic (flags only, no personal data); remove once verified identity is confirmed live.
  console.log("[whoami]", { isOnline: session.isOnline, hasUserId: session.userId != null, hasName: Boolean(session.firstName || session.lastName), hasEmail: Boolean(session.email) });
  return cors(Response.json({ shop: session.shop, staff: staffFromSession(session) }));
};
