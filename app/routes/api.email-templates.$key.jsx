import { randomUUID } from "node:crypto";
import db from "../db.server";
import { readMailConfig } from "../email/config.server";
import { enqueueEmails } from "../email/outbox.server";
import { PLACEHOLDERS } from "../email/placeholders";
import { renderPreview } from "../email/preview.server";
import { ensureSeeded } from "../email/seed/index.server";
import { getTemplate, restoreTemplate, saveTemplate } from "../email/templates.server";
import { runEmailTick } from "../email/worker.server";
import { authenticate } from "../shopify.server";
import { staffFromSession } from "../staff/staff.server";

const json = (cors, body, status = 200) => cors(Response.json(body, { status }));
const isText = (v, max) => typeof v === "string" && v.length <= max;

// One template with its versions. This loader also answers the browser's OPTIONS preflight before a POST
// from the extension (authenticate.admin does that), so it is required even though POST has its own action.
export const loader = async ({ request, params }) => {
  const { session, cors } = await authenticate.admin(request);
  await ensureSeeded(db, session.shop);
  const found = await getTemplate(db, session.shop, params.key);
  if (!found) return json(cors, { error: "not_found" }, 404);
  return json(cors, { template: found.template, versions: found.versions, placeholders: PLACEHOLDERS });
};

// save | restore | preview | test. Staff only: a template is what every customer gets.
export const action = async ({ request, params }) => {
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
  if (!body || typeof body !== "object") return json(cors, { error: "bad_request" }, 400);

  const shop = session.shop;
  const key = params.key;
  await ensureSeeded(db, shop);
  const current = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key } } });
  if (!current) return json(cors, { error: "not_found" }, 404);

  const { intent, subject, body: text, expectedVersion, version } = body;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (intent === "save" || intent === "restore") {
    if (!reason || reason.length > 500 || !Number.isInteger(expectedVersion)) return json(cors, { error: "bad_request" }, 400);
    let result;
    if (intent === "save") {
      if (!isText(subject, 1000) || !isText(text, 200_000)) return json(cors, { error: "bad_request" }, 400);
      result = await saveTemplate(db, { shop, key, subject, body: text, expectedVersion, reason, actor: staff });
    } else {
      if (!Number.isInteger(version)) return json(cors, { error: "bad_request" }, 400);
      result = await restoreTemplate(db, { shop, key, version, expectedVersion, reason, actor: staff });
    }
    if (result.ok) return json(cors, result);
    const status = { invalid: 422, stale: 409, not_found: 404 }[result.code] ?? 400;
    return json(cors, { ok: false, code: result.code, ...(result.errors ? { errors: result.errors } : {}) }, status);
  }

  if (intent === "preview" || intent === "test") {
    if (!isText(subject, 1000) || !isText(text, 200_000)) return json(cors, { error: "bad_request" }, 400);
    const preview = await renderPreview(db, shop, { key, subject, body: text });
    if (!preview.ok) return json(cors, { ok: false, code: "invalid", errors: preview.errors }, 422);
    if (intent === "preview") return json(cors, { ok: true, subject: preview.subject, html: preview.html });

    // Test send: only ever to the configured test addresses, never to a customer.
    const config = readMailConfig(process.env);
    if (!config.enabled) return json(cors, { ok: false, code: "email_off", reason: config.reason }, 409);
    if (config.allowlist.length === 0) return json(cors, { ok: false, code: "no_allowlist" }, 409);
    const run = randomUUID();
    const drafts = config.allowlist.map((recipient, i) => ({
      shop,
      orderId: "template-test",
      orderName: "Template test",
      templateKey: key,
      templateVersion: current.version,
      kind: "test",
      recipient,
      from: `${preview.site.fromName} <${config.fromAddress}>`,
      replyTo: preview.site.serviceEmail,
      subject: `[TEST] ${preview.subject}`,
      html: preview.html,
      actorId: staff.id,
      actorName: staff.name,
      dedupeKey: `test:${key}:${run}:${i}`,
    }));
    const { rows } = await enqueueEmails(db, drafts);
    void runEmailTick({ db }).catch((error) => console.error("Email send pass failed", error?.message ?? error));
    return json(cors, { ok: true, queued: rows.length });
  }

  return json(cors, { error: "bad_request" }, 400);
};
