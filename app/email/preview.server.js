// Renders a template (as typed, not yet saved) with sample data inside the shop's layout. Stores nothing.
import { renderEmail, sampleEmailData, validateTemplate } from "./render.server";
import { ensureSeeded } from "./seed/index.server";
import { DEFAULT_SITE_CODE } from "./seed/sites";

/** @returns {Promise<{ok:true,subject:string,html:string,site:object}|{ok:false,errors:string[]}>} */
export async function renderPreview(db, shop, { key, subject, body, now = new Date() }) {
  const checked = validateTemplate({ key, subject, body });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  await ensureSeeded(db, shop);

  const site = await db.emailSite.findUnique({ where: { shop_code: { shop, code: DEFAULT_SITE_CODE } } });
  const isLayout = key === "layout";
  // Previewing the layout puts a fixed sample message inside the layout being edited.
  const layout = isLayout ? { body } : await db.emailTemplate.findUnique({ where: { shop_key: { shop, key: "layout" } } });
  const template = isLayout ? { subject: "Sample", body: "<p>Sample message body.</p>" } : { subject, body };
  const { subject: renderedSubject, html } = renderEmail({ template, layout, site, data: sampleEmailData(), now });
  return { ok: true, subject: renderedSubject, html, site };
}
