import db from "../db.server";
import { listMinervaBrands, minervaReport, parseMinervaParams, readMinervaInput, saveMinervaBrand } from "../orders/minerva.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

// GET ?from=&to=: the Minerva Supplier Orders report (per brand) and the Minerva brands. Read only.
// POST { op: "save", brand, disc, from, to } | { op: "delete", brand }: set or remove a Minerva brand. Verified staff with the Pay suppliers permission.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseMinervaParams(new URL(request.url).searchParams);
  const [report, brands] = await Promise.all([minervaReport(db, session.shop, params), listMinervaBrands(db, session.shop)]);
  return cors(Response.json({ ...report, ...brands }));
};

export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified", message: "Your Shopify staff account could not be verified." }, 403);
  if (!(await can(db, session.shop, staff, "pay_suppliers"))) return json({ error: "no_permission", message: "You do not have permission to pay suppliers." }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readMinervaInput(body);
  if (read.error) return json({ error: read.error, message: read.message }, 400);
  return json(await saveMinervaBrand(db, session.shop, read.value, staff));
};
