import db from "../db.server";
import { VIEWS, addFreeStock, deleteFreeStock, importFreeStock, listFreeStock, updateFreeStock } from "../orders/free-stock.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// GET ?search=&view=available|used|all&type=&page=: one page of the free stock list. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const q = new URL(request.url).searchParams;
  const view = VIEWS.includes(q.get("view")) ? q.get("view") : "available";
  return json(cors, await listFreeStock(db, session.shop, { search: q.get("search") ?? "", view, itemType: q.get("type") ?? "", page: q.get("page") ?? 1 }));
};

// POST { item: { brand, productCode, qty, ... } } adds one record. POST { id, item } corrects a record. POST { id, remove: true } deletes it.
// POST { rows: [{ line, ... }] } imports a spreadsheet. Verified staff only.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return json(cors, { error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json(cors, { error: "staff_not_verified" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json(cors, { error: "bad_request" }, 400);
  }
  if (Array.isArray(body?.rows)) {
    const imported = await importFreeStock(db, session.shop, body.rows, staff);
    return imported.ok ? json(cors, imported) : json(cors, { error: imported.error }, 400);
  }
  if (typeof body?.id === "string") {
    const done = body.remove === true ? await deleteFreeStock(db, session.shop, body.id) : await updateFreeStock(db, session.shop, body.id, body.item);
    if (done.ok) return json(cors, { ok: true });
    return json(cors, { error: done.error, message: done.message }, done.error === "not_found" ? 404 : done.error === "allocated" ? 409 : 400);
  }
  const added = await addFreeStock(db, session.shop, body?.item, staff);
  return added.ok ? json(cors, { ok: true, id: added.id }) : json(cors, { error: added.error, message: added.message }, 400);
};
