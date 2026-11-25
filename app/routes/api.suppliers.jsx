import db from "../db.server";
import { listSuppliers, saveSupplier } from "../orders/supplier-chase.server";
import { readContactInput } from "../orders/supplier-chase-rules";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// GET: every brand with its supplier email, copy address and "ordered by hand" flag.
// POST { brand, email, cc, handOrdered }: save one brand's details. Verified staff only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json({ suppliers: await listSuppliers(db, session.shop) }));
};

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
  const read = readContactInput(body);
  if (read.error) return json({ error: read.error }, 400);
  await saveSupplier(db, session.shop, read.value, staff);
  return json({ ok: true });
};
