import db from "../db.server";
import { PLACEHOLDERS } from "../email/placeholders";
import { ensureSeeded, templateName } from "../email/seed/index.server";
import { listTemplates } from "../email/templates.server";
import { authenticate } from "../shopify.server";

// Every email template of the shop (seeded from the legacy wording the first time), and the placeholders staff may use.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  await ensureSeeded(db, session.shop);
  const rows = await listTemplates(db, session.shop);
  const templates = rows.map((t) => ({ key: t.key, name: templateName(t.key), version: t.version, updatedByName: t.updatedByName, updatedAt: t.updatedAt }));
  return cors(Response.json({ templates, placeholders: PLACEHOLDERS }));
};
