// Reading and editing email templates. Every change is a new version; nothing is ever overwritten in place.
import { validateTemplate } from "./render.server";

export const listTemplates = (db, shop) => db.emailTemplate.findMany({ where: { shop } });

export async function getTemplate(db, shop, key) {
  const template = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key } } });
  if (!template) return null;
  const versions = await db.emailTemplateVersion.findMany({ where: { shop, key } });
  return { template, versions };
}

/** @returns {Promise<{ok:true,version:number}|{ok:false,code:"not_found"|"stale"|"invalid",errors?:string[]}>} */
export async function saveTemplate(db, { shop, key, subject, body, expectedVersion, reason, actor }) {
  const current = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key } } });
  if (!current) return { ok: false, code: "not_found" };
  const checked = validateTemplate({ key, subject, body });
  if (!checked.ok) return { ok: false, code: "invalid", errors: checked.errors };
  const next = expectedVersion + 1;
  try {
    return await db.$transaction(async (tx) => {
      // The version in the where clause is the guard: if someone saved meanwhile, nothing matches.
      const { count } = await tx.emailTemplate.updateMany({
        where: { shop, key, version: expectedVersion },
        data: { subject, body, version: next, updatedById: actor?.id ?? null, updatedByName: actor?.name ?? null },
      });
      if (count === 0) return { ok: false, code: "stale" };
      await tx.emailTemplateVersion.create({
        data: { shop, key, version: next, subject, body, reason: reason ?? null, actorId: actor?.id ?? null, actorName: actor?.name ?? null },
      });
      return { ok: true, version: next };
    });
  } catch (error) {
    if (error?.code === "P2002") return { ok: false, code: "stale" };
    throw error;
  }
}

export async function restoreTemplate(db, { shop, key, version, expectedVersion, reason, actor }) {
  const old = await db.emailTemplateVersion.findUnique({ where: { shop_key_version: { shop, key, version } } });
  if (!old) return { ok: false, code: "not_found" };
  const note = `Restored version ${version}${reason ? `: ${reason}` : ""}`;
  return saveTemplate(db, { shop, key, subject: old.subject, body: old.body, expectedVersion, reason: note, actor });
}
