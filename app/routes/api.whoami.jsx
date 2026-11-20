import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// Who is calling: the shop and the verified staff member from the session token.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json({ shop: session.shop, staff: staffFromSession(session) }));
};
