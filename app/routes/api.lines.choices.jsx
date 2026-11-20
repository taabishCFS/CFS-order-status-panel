import { callConfigurator, ConfiguratorError } from "../configurator/client.server";
import { authenticate } from "../shopify.server";

// The groups and choices of a configurable product, for the staff option picker.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const product = new URL(request.url).searchParams.get("product") ?? "";
  if (!/^\d{1,20}$/.test(product)) return cors(Response.json({ error: "bad_request" }, { status: 400 }));

  try {
    return cors(Response.json(await callConfigurator({ shop: session.shop, path: `/staff/choices?product=${product}` })));
  } catch (error) {
    if (!(error instanceof ConfiguratorError)) throw error;
    const known = error.status === 404 || error.status === 422;
    console.error("Choices: configurator call failed", error.status, error.code);
    return cors(Response.json({ error: known ? error.code : "configurator_unavailable", code: error.code }, { status: known ? error.status : 502 }));
  }
};
