import db from "../db.server";
import { previewChange } from "../configurator/apply.server";
import { callConfigurator, ConfiguratorError } from "../configurator/client.server";
import { readChange, statusFor } from "../configurator/request.server";
import { authenticate } from "../shopify.server";

// The browser sends an OPTIONS preflight before a POST from the extension. React Router gives that
// to a loader, and authenticate.admin answers it. Without this the browser reports "Failed to fetch".
export const loader = async ({ request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));
};

// Prices a new selection for one saved line and gives the whole-line difference. Changes nothing.
export const action = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  if (request.method !== "POST") return cors(Response.json({ error: "method_not_allowed" }, { status: 405 }));

  let body;
  try {
    body = await request.json();
  } catch {
    return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  }
  const read = readChange(body);
  if (read.error) return cors(Response.json({ error: read.error }, { status: 400 }));
  const { orderId, lineItemId, choiceIds, quantities } = read.value;

  try {
    const p = await previewChange({
      db,
      call: (req) => callConfigurator({ ...req, shop: session.shop }),
      shop: session.shop,
      orderId,
      lineItemId,
      choiceIds,
      quantities,
    });
    if (!p.ok) return cors(Response.json({ ok: false, outcome: p.outcome, message: p.message }, { status: statusFor(p.outcome) }));
    return cors(
      Response.json({
        ok: true,
        version: p.version,
        currentUnitMinor: p.currentUnitMinor,
        newUnitMinor: p.newUnitMinor,
        deltaMinor: p.deltaMinor,
        same: p.same,
        options: p.configuration.options,
      }),
    );
  } catch (error) {
    if (!(error instanceof ConfiguratorError)) throw error;
    console.error("Quote: configurator call failed", error.status, error.code);
    return cors(Response.json({ error: "configurator_unavailable", code: error.code }, { status: 502 }));
  }
};
