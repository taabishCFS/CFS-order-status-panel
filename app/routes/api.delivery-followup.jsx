import db from "../db.server";
import { dmy, issueConfirmLink, rescheduleToDate, sendNotConfirmed } from "../delivery/delivery-confirm.server";
import { readFollowUp } from "../delivery/delivery-followup-rules";
import { withMessage } from "../delivery/error-messages";
import { readMailConfig } from "../email/config.server";
import { queueOrderEmails } from "../email/queue-order-emails.server";
import { runEmailTick } from "../email/worker.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { no_lines: 404, not_booked: 409, bad_date: 400 };
const slotText = (amPm) => (amPm === "ALL" ? "All Day" : amPm ?? "");

// POST: Bulk Reschedule (move the ticked lines to one date, email a new confirm link) and Not Confirmed (email only), from the delivery pages.
// Needs a verified staff member with the Book Delivery permission. The loader answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

export const action = async ({ request }) => {
  const { session, cors, admin } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(withMessage(body), { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  const shop = session.shop;
  if (!(await can(db, shop, staff, "book_delivery"))) return json({ error: "no_permission" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readFollowUp(body);
  if (read.error) return json({ error: read.error }, STATUS[read.error] ?? 400);
  const req = read.value;
  const config = readMailConfig(process.env);
  const queue = async (orderId, request) => {
    const sent = await queueOrderEmails(db, { shop, orderId, request, actor: staff, config });
    if (sent.ok) void runEmailTick({ db }).catch((e) => console.error("Email send pass failed", e?.message ?? e));
    return sent;
  };

  if (req.action === "not_confirmed") {
    const result = await sendNotConfirmed(db, {
      shop, lineIds: req.lineIds, actor: staff,
      queueEmail: ({ orderId, lineIds, lines }) => {
        const dateOf = new Map(lines.map((b) => [b.lineId, b.date]));
        const lineExtras = Object.fromEntries(lineIds.map((id) => [id, { deliveryDate: dmy(dateOf.get(id)) }]));
        return queue(orderId, { templateKey: "delivery.not_confirmed", lineIds, extras: { deliveryDate: dmy(lines[0]?.date) }, lineExtras });
      },
    });
    return result.ok ? json(result) : json({ error: result.code }, STATUS[result.code] ?? 400);
  }

  const result = await rescheduleToDate(db, {
    shop, request: req, actor: staff, graphql: admin.graphql,
    queueEmail: async ({ orderId, lineIds, date, lines }) => {
      const confirmLink = await issueConfirmLink(db, { shop, lineIds });
      const lineExtras = Object.fromEntries(lines.map((b) => [b.lineId, { deliveryDate: dmy(date), slot: slotText(b.amPm), drop: b.drop === null ? "" : String(b.drop) }]));
      return queue(orderId, { templateKey: "delivery.new_date", lineIds, extras: { deliveryDate: dmy(date), confirmLink }, lineExtras });
    },
  });
  return result.ok ? json(result) : json({ error: result.code }, STATUS[result.code] ?? 400);
};
