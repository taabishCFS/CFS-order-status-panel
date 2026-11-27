import db from "../db.server";
import { withMessage } from "../delivery/error-messages";
import { readMailConfig } from "../email/config.server";
import { queueOrderEmails } from "../email/queue-order-emails.server";
import { runEmailTick } from "../email/worker.server";
import { MARKS, parseBulkParams, readBulkRequest } from "../delivery/bulk-delivery-rules";
import { issueConfirmLink } from "../delivery/delivery-confirm.server";
import { bulkBook, bulkReschedule, listBookable, loadForBooking, markLines } from "../delivery/bulk-delivery.server";
import { activeAreas } from "../delivery/area.server";
import { listBrands } from "../orders/list-query.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { no_lines: 404, not_booked: 409, unknown_van: 422, duplicate: 409 };
const dmy = (iso) => iso.split("-").reverse().join("/");

// GET ?q=&brand=&area=&page=: the Book Delivery list (lines ready to book) and the brands for the filter.
// POST { action: mark | load | book | reschedule, ... }: Mark TNT/Pallet/FurDeco, load the Delivery Booking page, book (and email the customers), reschedule.
// Everything except GET needs a verified staff member with the Book Delivery permission.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const params = parseBulkParams(new URL(request.url).searchParams);
  const [list, brands, areas] = await Promise.all([listBookable(db, session.shop, params), listBrands(db, session.shop), activeAreas(db, session.shop)]);
  return cors(Response.json({ ...list, brands, areas }));
};

export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(withMessage(body), { status }));
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
  const read = readBulkRequest(body);
  if (read.error) return json({ error: read.error }, 400);
  const req = read.value;
  const shop = session.shop;

  if (req.action === "load") return json(await loadForBooking(db, shop, req.lineIds));
  if (req.action === "mark") return json(await markLines(db, { shop, lineIds: req.lineIds, partner: MARKS[req.mark], actor: staff }));
  if (req.action === "reschedule") {
    const result = await bulkReschedule(db, { shop, request: req, actor: staff });
    return result.ok ? json(result) : json({ error: result.code }, STATUS[result.code] ?? 400);
  }

  const config = readMailConfig(process.env);
  const queueEmail = async ({ orderId, lines, prebook }) => {
    const lineIds = lines.map((l) => l.lineId);
    const date = dmy(lines[0].date);
    const lineExtras = Object.fromEntries(lines.map((l) => [l.lineId, { deliveryDate: dmy(l.date), slot: l.amPm ?? "", drop: l.drop === null ? "" : String(l.drop) }]));
    const templateKey = prebook ? "delivery.prebooked" : "delivery.booking_confirmation";
    const confirmLink = prebook ? "" : await issueConfirmLink(db, { shop, lineIds });
    const sent = await queueOrderEmails(db, { shop, orderId, request: { templateKey, lineIds, extras: { deliveryDate: date, confirmLink }, lineExtras }, actor: staff, config });
    if (sent.ok) void runEmailTick({ db }).catch((e) => console.error("Email send pass failed", e?.message ?? e));
    return sent;
  };
  const result = await bulkBook(db, { shop, request: req, actor: staff, queueEmail });
  if (!result.ok) return json({ error: result.code, duplicates: result.duplicates }, STATUS[result.code] ?? 400);
  return json(result);
};
