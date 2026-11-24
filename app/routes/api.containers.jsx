import db from "../db.server";
import { CONTAINER_VIEWS, addContainerFreight, addContainerStock, deleteContainerStock, importContainerStock, listContainerFreight, listContainerStock, updateContainerStock } from "../orders/container-stock.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// GET ?search=&view=available|onWater|used|all&page=: one page of container stock, plus the freight paid per container. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const q = new URL(request.url).searchParams;
  const view = CONTAINER_VIEWS.includes(q.get("view")) ? q.get("view") : "available";
  const [list, freight] = await Promise.all([listContainerStock(db, session.shop, { search: q.get("search") ?? "", view, page: q.get("page") ?? 1 }), listContainerFreight(db, session.shop)]);
  return json(cors, { ...list, freight });
};

// POST { item } adds one record. POST { id, item } corrects a record. POST { id, remove: true } deletes it. POST { rows: [{ line, ... }] } imports a spreadsheet.
// POST { freight: { itemVendor, containerNo, freight } } records freight paid. Verified staff only.
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
    const imported = await importContainerStock(db, session.shop, body.rows, staff);
    return imported.ok ? json(cors, imported) : json(cors, { error: imported.error }, 400);
  }
  if (body?.freight && typeof body.freight === "object") {
    const done = await addContainerFreight(db, session.shop, body.freight, staff);
    return done.ok ? json(cors, { ok: true }) : json(cors, { error: done.error, message: done.message }, 400);
  }
  if (typeof body?.id === "string") {
    const done = body.remove === true ? await deleteContainerStock(db, session.shop, body.id) : await updateContainerStock(db, session.shop, body.id, body.item);
    if (done.ok) return json(cors, { ok: true });
    return json(cors, { error: done.error, message: done.message }, done.error === "not_found" ? 404 : done.error === "allocated" ? 409 : 400);
  }
  const added = await addContainerStock(db, session.shop, body?.item, staff);
  return added.ok ? json(cors, { ok: true, id: added.id }) : json(cors, { error: added.error, message: added.message }, 400);
};
