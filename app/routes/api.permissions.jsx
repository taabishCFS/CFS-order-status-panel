import db from "../db.server";
import { PERMISSIONS, listStaff, permissionsFor, recordStaff, setStaffPermissions } from "../staff/permissions.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { forbidden: 403, bad_request: 400, not_found: 404, last_manager: 409 };

// GET: what the caller may do, and (for a manager) every known staff member with their permissions.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const staff = staffFromSession(session);
  if (!staff) return cors(Response.json({ error: "staff_not_verified" }, { status: 403 }));
  await recordStaff(db, session.shop, staff).catch(() => null);
  const mine = await permissionsFor(db, session.shop, staff);
  const list = mine.canManage ? await listStaff(db, session.shop) : [];
  return cors(Response.json({ me: { id: staff.id, name: staff.name, ...mine }, permissions: PERMISSIONS, staff: list }));
};

// POST { staffId, keys: [...] }: set one person's permissions. Managers only.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const result = await setStaffPermissions(db, session.shop, staff, body?.staffId, body?.keys);
  return result.ok ? json({ ok: true }) : json({ error: result.error }, STATUS[result.error] ?? 400);
};
