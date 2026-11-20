import db from "../db.server";
import { callConfigurator, ConfiguratorError } from "../configurator/client.server";
import { currentConfiguration } from "../configurator/versions.server";
import { authenticate } from "../shopify.server";

// The configured lines of one order: current options, whether each can be edited, and version history.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (!/^\d{1,20}$/.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));

  try {
    const result = await currentConfiguration(db, (req) => callConfigurator({ ...req, shop: session.shop }), {
      shop: session.shop,
      orderId: `gid://shopify/Order/${params.id}`,
    });
    return cors(Response.json(result));
  } catch (error) {
    if (!(error instanceof ConfiguratorError)) throw error;
    console.error("Configuration: configurator call failed", error.status, error.code);
    return cors(Response.json({ error: "configurator_unavailable", code: error.code }, { status: 502 }));
  }
};
