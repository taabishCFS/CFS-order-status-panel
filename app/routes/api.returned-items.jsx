import db from "../db.server";
import { listReturnedItems, markReturnAction, parseReturnedParams, readMarkInput } from "../orders/returned-items.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));

// GET ?page=&q=: one page of cancelled (returned) lines. Also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  return json(cors, await listReturnedItems(db, session.shop, parseReturnedParams(new URL(request.url).searchParams)));
};

// POST { lineIds, action }: record what was done with the ticked lines' returned goods. Verified staff only.
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
  const read = readMarkInput(body);
  if (read.error) return json(cors, { error: read.error }, 400);
  return json(cors, await markReturnAction(db, session.shop, read.value, staff));
};
