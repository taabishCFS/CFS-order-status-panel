import db from "../db.server";
import { applyConfiguration } from "../configurator/apply.server";
import { callConfigurator } from "../configurator/client.server";
import { readChange, statusFor } from "../configurator/request.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

// Applies a staff change to one configured line. Needs a verified staff member and a reason.
export const action = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));

  const staff = staffFromSession(session);
  if (!staff) return cors(Response.json({ error: "staff_not_verified" }, { status: 403 }));

  let body;
  try {
    body = await request.json();
  } catch {
    return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  }
  const read = readChange(body);
  if (read.error || read.value.expectedVersion === null) return cors(Response.json({ error: "bad_request" }, { status: 400 }));

  const result = await applyConfiguration({
    db,
    graphql: admin.graphql,
    call: (req) => callConfigurator({ ...req, shop: session.shop }),
    staff,
    shop: session.shop,
    ...read.value,
  });
  return cors(Response.json(result, { status: statusFor(result.outcome) }));
};
