import db from "../db.server";
import { addCollection, deleteCollections, listCollections, readCollectionInput } from "../delivery/supplier-collection.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?page=: the Supplier Collection list, the brands and the active vans.
// POST { op: "add", brand, vanId, date } or { op: "delete", ids }: change the list. Verified staff with the Book and reschedule deliveries permission.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const page = new URL(request.url).searchParams.get("page");
  return cors(Response.json(await listCollections(db, session.shop, page)));
};

export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!(await can(db, session.shop, staff, "book_delivery"))) return json({ error: "no_permission" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readCollectionInput(body);
  if (read.error) return json({ error: read.error }, 400);
  if (read.value.op === "delete") return json(await deleteCollections(db, session.shop, read.value.ids));
  const done = await addCollection(db, session.shop, read.value, staff);
  return done.ok ? json({ ok: true }) : json({ error: done.code }, done.code === "duplicate" ? 409 : 400);
};
