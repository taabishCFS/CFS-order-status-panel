// Fills the template tables from the legacy wording the first time a shop needs them. Never overwrites anything.
import { LAYOUT } from "./layout";
import { OTHER_TEMPLATES } from "./other-templates";
import { SITES } from "./sites";
import { STATUS_TEMPLATES } from "./status-templates";

export const SEEDED_TEMPLATES = [LAYOUT, ...STATUS_TEMPLATES, ...OTHER_TEMPLATES];
export const templateName = (key) => SEEDED_TEMPLATES.find((t) => t.key === key)?.label ?? key;
const isDuplicate = (error) => error?.code === "P2002";
const IMPORT_REASON = "Imported from legacy";

async function createIgnoringDuplicate(create) {
  try {
    await create();
  } catch (error) {
    if (!isDuplicate(error)) throw error; // another request seeded it first
  }
}

export async function ensureSeeded(db, shop) {
  // Two reads tell us what is missing; this runs on every email request, so it must stay cheap.
  const haveSites = new Set((await db.emailSite.findMany({ where: { shop }, select: { code: true } })).map((s) => s.code));
  const haveTemplates = new Set((await db.emailTemplate.findMany({ where: { shop }, select: { key: true } })).map((t) => t.key));

  for (const { code, ...rest } of SITES) {
    if (haveSites.has(code)) continue;
    await createIgnoringDuplicate(() => db.emailSite.create({ data: { shop, code, ...rest } }));
  }
  for (const { key, subject, body } of SEEDED_TEMPLATES) {
    if (haveTemplates.has(key)) continue;
    await createIgnoringDuplicate(() =>
      db.$transaction(async (tx) => {
        await tx.emailTemplate.create({ data: { shop, key, subject, body, version: 1 } });
        await tx.emailTemplateVersion.create({ data: { shop, key, version: 1, subject, body, reason: IMPORT_REASON } });
      }),
    );
  }
}
