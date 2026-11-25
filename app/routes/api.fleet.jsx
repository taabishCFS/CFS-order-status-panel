import db from "../db.server";
import { readBulkFleet, readFleetInput } from "../delivery/delivery-rules";
import { bulkFleet, listFleet, saveFleetItem } from "../delivery/delivery.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET: the driver, van and delivery slot lists (inactive ones too).
// POST { kind: driver|van|slot, op: add|rename|deactivate|restore, id?, name?, extra? }: change one. Needs the Van Management permission.
// POST { kind: driver|van, bulk: true, action: activate|deactivate|delete, ids }: change several at once.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listFleet(db, session.shop)));
};

export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!(await can(db, session.shop, staff, "van_management"))) return json({ error: "no_permission" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (body && body.bulk === true) {
    const bulk = readBulkFleet(body);
    if (bulk.error) return json({ error: "bad_request" }, 400);
    const done = await bulkFleet(db, session.shop, bulk.value);
    if (!done.ok) return json({ error: done.code }, 404);
    return json({ ok: true, changed: done.changed, blocked: done.blocked, fleet: await listFleet(db, session.shop) });
  }
  const read = readFleetInput(body);
  if (read.error) return json({ error: "bad_request" }, 400);
  const result = await saveFleetItem(db, session.shop, read.value);
  if (!result.ok) return json({ error: result.code }, result.code === "not_found" ? 404 : 409);
  return json({ ok: true, fleet: await listFleet(db, session.shop) });
};
