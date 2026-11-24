import db from "../db.server";
import { authenticate } from "../shopify.server";
import { permissionsFor, recordStaff } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// Who is calling: the shop and the verified staff member from the session token.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const staff = staffFromSession(session);
  let permissions = null;
  try {
    await recordStaff(db, session.shop, staff);
    permissions = staff ? await permissionsFor(db, session.shop, staff) : null;
  } catch (error) {
    console.error("Staff record failed", error?.message ?? error);
  }
  return cors(Response.json({ shop: session.shop, staff, permissions }));
};
