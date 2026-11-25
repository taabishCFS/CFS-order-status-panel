import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { queueOrderEmails } from "../email/queue-order-emails.server";
import { runEmailTick } from "../email/worker.server";
import { readBookingRequest } from "../delivery/delivery-rules";
import { bookDelivery, orderDelivery, rescheduleDelivery } from "../delivery/delivery.server";
import { authenticate } from "../shopify.server";
import { can } from "../staff/permissions.server";
import { staffFromSession } from "../staff/staff.server";

const STATUS = { no_lines: 404, not_booked: 409, unknown_van: 422, unknown_driver: 422, unknown_slot: 422, duplicate: 409 };
const gid = (id) => `gid://shopify/Order/${id}`;

// GET: this order's delivery bookings, history, and the active driver, van and slot lists.
// POST { action: check | book | reschedule, lineIds, date, vanId, driverId, slotId, drop, amPm, allowDuplicate | reason, emailCustomer }.
// Booking and rescheduling need a verified staff member with the Book Delivery permission.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  return cors(Response.json(await orderDelivery(db, session.shop, gid(params.id))));
};

export const action = async ({ request, params }) => {
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
  const read = readBookingRequest(body);
  if (read.error) return json({ error: read.error }, 400);
  const shop = session.shop;
  const orderId = gid(params.id);

  if (read.value.action === "reschedule") {
    const config = readMailConfig(process.env);
    const queueEmail = async ({ lineIds, reason }) => {
      const sent = await queueOrderEmails(db, { shop, orderId, request: { templateKey: "delivery.rescheduled", lineIds, extras: { reason } }, actor: staff, config });
      if (sent.ok) void runEmailTick({ db }).catch((e) => console.error("Email send pass failed", e?.message ?? e));
      return sent;
    };
    const result = await rescheduleDelivery(db, { shop, orderId, request: read.value, actor: staff, queueEmail });
    return result.ok ? json(result) : json({ error: result.code }, STATUS[result.code] ?? 400);
  }

  const config = readMailConfig(process.env);
  const queueEmail = async ({ lineIds, date, amPm, drop }) => {
    const shown = date.split("-").reverse().join("/");
    const slot = amPm === "ALL" ? "All Day" : amPm ?? "";
    const lineExtras = Object.fromEntries(lineIds.map((lineId) => [lineId, { deliveryDate: shown, slot, drop: drop === null ? "" : String(drop) }]));
    const sent = await queueOrderEmails(db, { shop, orderId, request: { templateKey: "delivery.booking_confirmation", lineIds, extras: { deliveryDate: shown }, lineExtras }, actor: staff, config });
    if (sent.ok) void runEmailTick({ db }).catch((e) => console.error("Email send pass failed", e?.message ?? e));
    return sent;
  };
  const result = await bookDelivery(db, { shop, orderId, request: read.value, actor: staff, queueEmail });
  if (!result.ok) return json({ error: result.code, duplicates: result.duplicates }, STATUS[result.code] ?? 400);
  return json(result);
};
