import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { authenticate } from "../shopify.server";

// The emails sent (or queued, or failed) for one order, newest first, and whether sending is on.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  if (!/^\d{1,20}$/.test(params.id ?? "")) return cors(Response.json({ error: "bad_request" }, { status: 400 }));

  const config = readMailConfig(process.env);
  const rows = await db.emailOutbox.findMany({
    where: { shop: session.shop, orderId: `gid://shopify/Order/${params.id}` },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const emails = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    templateKey: r.templateKey,
    recipient: r.recipient,
    subject: r.subject,
    status: r.status,
    error: r.error,
    mode: r.mode,
    attempts: r.attempts,
    actorName: r.actorName,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
  }));
  return cors(Response.json({ mode: config.mode, enabled: config.enabled, reason: config.reason ?? null, emails }));
};
