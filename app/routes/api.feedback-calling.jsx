import db from "../db.server";
import { changeCallers, listCallers, listFeedbackCalls, parseFeedbackParams, readCallSave, saveCallField, shareOut } from "../orders/feedback-calling.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// GET ?from=&to=&q=&staff=&page=&all=1: completed orders to call for a review. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return json(cors, await listFeedbackCalls(db, session.shop, parseFeedbackParams(new URL(request.url).searchParams)));
};

// POST { orderId, field, value }: save one call detail.
// POST { shareOut: { from, to, q } }: give the unassigned orders in that filter to the callers in turn.
// POST { add: name } | { remove: name }: change the callers list. Verified staff only.
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
  if (body?.shareOut && typeof body.shareOut === "object") {
    const p = parseFeedbackParams(new URLSearchParams(Object.entries(body.shareOut).filter(([, v]) => typeof v === "string")));
    const done = await shareOut(db, session.shop, p, staff);
    return done.ok ? json(cors, done) : json(cors, { error: done.error }, 400);
  }
  if (typeof body?.add === "string" || typeof body?.remove === "string") {
    const done = await changeCallers(db, session.shop, body);
    return done.ok ? json(cors, done) : json(cors, { error: done.error }, done.error === "not_found" ? 404 : 400);
  }
  const read = readCallSave(body, await listCallers(db, session.shop));
  if (read.error) return json(cors, { error: read.error }, 400);
  const done = await saveCallField(db, session.shop, read.value, staff);
  return done.ok ? json(cors, done) : json(cors, { error: done.error }, 404);
};
