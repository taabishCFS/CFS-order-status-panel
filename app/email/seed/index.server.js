// Fills the template tables from the legacy wording the first time a shop needs them. Never overwrites anything.
import { LAYOUT } from "./layout";
import { BOOKING_CONFIRMATION_BODY, BOOKING_CONFIRMATION_RED, BOOKING_CONFIRMATION_V1, NEW_DATE_BODY, NEW_DATE_RED, OTHER_TEMPLATES } from "./other-templates";
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

// Wording we changed after a template was first imported. A shop whose template is still exactly the old text gets the new one
// (as a new version); a template staff have edited is left alone.
export const UPGRADES = [
  { key: "delivery.booking_confirmation", from: [BOOKING_CONFIRMATION_V1, BOOKING_CONFIRMATION_RED], to: BOOKING_CONFIRMATION_BODY, reason: "Confirm button (brown) added" },
  { key: "delivery.new_date", from: [NEW_DATE_RED], to: NEW_DATE_BODY, reason: "Confirm button made brown" },
];

async function applyUpgrades(db, shop) {
  for (const u of UPGRADES) {
    const row = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key: u.key } } });
    if (!row || !u.from.includes(row.body)) continue;
    const version = row.version + 1;
    const done = await db.emailTemplate.updateMany({ where: { shop, key: u.key, version: row.version }, data: { body: u.to, version } });
    if (done.count === 1) await db.emailTemplateVersion.create({ data: { shop, key: u.key, version, subject: row.subject, body: u.to, reason: u.reason } });
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
  if (haveTemplates.size > 0) await applyUpgrades(db, shop);
}
