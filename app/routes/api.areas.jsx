import db from "../db.server";
import { deleteAreas, listAreas, readAreaInput, saveArea, setAreasActive } from "../delivery/area.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?page=: the Area list.
// POST { op: "add" | "update" | "status" | "delete", ... }: change it. Verified staff with the Edit drivers, vans and slots permission.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await listAreas(db, session.shop, new URL(request.url).searchParams.get("page"))));
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
  const read = readAreaInput(body);
  if (read.error) return json({ error: read.error }, 400);
  const v = read.value;
  if (v.op === "delete") return json(await deleteAreas(db, session.shop, v.ids));
  if (v.op === "status") return json(await setAreasActive(db, session.shop, v.ids, v.active));
  const done = await saveArea(db, session.shop, v);
  return done.ok ? json({ ok: true }) : json({ error: done.code }, done.code === "duplicate" ? 409 : 404);
};
