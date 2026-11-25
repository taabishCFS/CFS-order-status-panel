import db from "../db.server";
import { parseBookedParams, readBookedRequest } from "../delivery/booked-delivery-rules";
import { listBooked, saveDrops } from "../delivery/booked-delivery.server";
import { bulkReschedule } from "../delivery/bulk-delivery.server";
import { listBrands } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { no_lines: 404, not_booked: 409, drop_limit: 422, bad_drop: 422 };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// GET ?from=&to=&brand=&q=: the Delivery Booked page (runs of one day, van and driver) and the brands for the filter.
// POST { action: drops | reschedule, ... }: save New Drop numbers for a run, or clear bookings. Needs a verified staff member with the Book Delivery permission.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseBookedParams(new URL(request.url).searchParams, today());
  const [list, brands] = await Promise.all([listBooked(db, session.shop, params), listBrands(db, session.shop)]);
  return cors(Response.json({ ...list, from: params.from, to: params.to, brands }));
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
  const read = readBookedRequest(body);
  if (read.error) return json({ error: read.error }, STATUS[read.error] ?? 400);
  const shop = session.shop;
  const result = read.value.action === "drops"
    ? await saveDrops(db, { shop, request: read.value, actor: staff })
    : await bulkReschedule(db, { shop, request: read.value, actor: staff });
  return result.ok ? json(result) : json({ error: result.code }, STATUS[result.code] ?? 400);
};
