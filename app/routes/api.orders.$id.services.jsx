import { SERVICES, planServiceChanges, readServicesInput, serviceChanges } from "../orders/services";
import { applyServices, readServices } from "../orders/services.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const ID = /^\d{1,20}$/;

// GET: the six services with the amount on the order (pence) or null. This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request, params }) => {
  const { admin, cors } = await authenticate.admin(request);
  if (!ID.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));
  try {
    const { currency, services } = await readServices(admin.graphql, `gid://shopify/Order/${params.id}`);
    return cors(Response.json({ currency, services: SERVICES.map((s) => ({ key: s.key, label: s.label, amountMinor: services[s.key]?.amountMinor ?? null })) }));
  } catch (error) {
    console.error(`Services read ${params.id} failed`, error?.message ?? error);
    return cors(Response.json({ error: "shopify_unavailable" }, { status: 502 }));
  }
};

// POST { services: { key: "50.00" | "" } }: put the services on, take them off or change their amount, in one order edit.
// Verified staff only. Returns what changed so the page can record it in the history.
export const action = async ({ request, params }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  const json = (body, status = 200) => cors(Response.json(body, { status }));
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staff = staffFromSession(session);
  if (!staff) return json({ error: "staff_not_verified" }, 403);
  if (!ID.test(params.id ?? "")) return json({ error: "bad_request" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const read = readServicesInput(body);
  if (read.error) return json({ error: read.error }, 400);

  const orderId = `gid://shopify/Order/${params.id}`;
  try {
    const { currency, services } = await readServices(admin.graphql, orderId);
    const plan = planServiceChanges(services, read.value);
    const changes = serviceChanges(services, read.value);
    const { changed } = await applyServices(admin.graphql, { orderId, currency, plan, note: `Delivery & services updated by ${staff.name}` });
    return json({ ok: true, changed, changes: changed ? changes : [] });
  } catch (error) {
    console.error(`Services update ${params.id} failed at ${error?.stage ?? "?"}`, error?.message ?? error);
    return json({ error: "shopify_rejected", message: error?.message ?? "Shopify refused the change" }, 422);
  }
};
