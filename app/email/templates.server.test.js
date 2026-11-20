import { beforeEach, describe, expect, it } from "vitest";
import { fakeTemplatesDb } from "./fixtures";
import { ensureSeeded } from "./seed/index.server";
import { getTemplate, listTemplates, restoreTemplate, saveTemplate } from "./templates.server";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam Patel", source: "verified" };
let db;
beforeEach(async () => {
  db = fakeTemplatesDb();
  await ensureSeeded(db, SHOP);
});
const save = (over = {}) => saveTemplate(db, { shop: SHOP, key: "status.3", subject: "New {{order_number}}", body: "Dear {{customer_first_name}}", expectedVersion: 1, reason: "Wording", actor, ...over });

describe("ensureSeeded", () => {
  it("creates the sites, the layout and the templates, each at version 1 with an import record", () => {
    expect(db.sites.map((s) => s.code).sort()).toEqual(["CFS", "FURN", "MM", "TFS", "UD", "eBay"]);
    expect(db.templates.find((t) => t.key === "layout")).toMatchObject({ version: 1 });
    expect(db.templates.length).toBeGreaterThanOrEqual(17);
    expect(db.versions.find((v) => v.key === "status.3")).toMatchObject({ version: 1, reason: "Imported from legacy" });
  });

  it("creates nothing the second time", async () => {
    const [t, v, s] = [db.templates.length, db.versions.length, db.sites.length];
    await ensureSeeded(db, SHOP);
    expect([db.templates.length, db.versions.length, db.sites.length]).toEqual([t, v, s]);
  });

  it("checks an already-seeded shop with two reads, not one read per template", async () => {
    const reads = { one: 0, many: 0 };
    for (const model of [db.emailTemplate, db.emailSite]) {
      const { findUnique, findMany } = model;
      model.findUnique = async (...a) => { reads.one += 1; return findUnique(...a); };
      model.findMany = async (...a) => { reads.many += 1; return findMany(...a); };
    }
    await ensureSeeded(db, SHOP);
    expect(reads).toEqual({ one: 0, many: 2 });
  });

  it("fills in only what is missing", async () => {
    db.templates.splice(db.templates.findIndex((t) => t.key === "tracking"), 1);
    db.sites.splice(0, 1);
    await ensureSeeded(db, SHOP);
    expect(db.templates.some((t) => t.key === "tracking")).toBe(true);
    expect(db.sites).toHaveLength(6);
  });

  it("never overwrites a template staff have edited", async () => {
    await save();
    await ensureSeeded(db, SHOP);
    expect(db.templates.find((t) => t.key === "status.3")).toMatchObject({ version: 2, subject: "New {{order_number}}" });
  });

  it("seeds each shop separately", async () => {
    await ensureSeeded(db, "other.myshopify.com");
    expect(db.templates.filter((t) => t.shop === "other.myshopify.com").length).toBe(db.templates.filter((t) => t.shop === SHOP).length);
  });
});

describe("saveTemplate", () => {
  it("writes the next version with the actor and the reason", async () => {
    expect(await save()).toEqual({ ok: true, version: 2 });
    expect(db.templates.find((t) => t.key === "status.3")).toMatchObject({ version: 2, body: "Dear {{customer_first_name}}", updatedByName: "Sam Patel", updatedById: "9" });
    expect(db.versions.find((v) => v.key === "status.3" && v.version === 2)).toMatchObject({ actorName: "Sam Patel", reason: "Wording", subject: "New {{order_number}}" });
  });

  it("is stale when the template moved on", async () => {
    await save();
    expect(await save({ expectedVersion: 1 })).toEqual({ ok: false, code: "stale" });
    expect(db.templates.find((t) => t.key === "status.3").version).toBe(2);
  });

  it("refuses an invalid template with the errors and writes nothing", async () => {
    const result = await save({ body: "Hello {{nope}}" });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(result.errors.join(" ")).toContain("nope");
    expect(db.templates.find((t) => t.key === "status.3").version).toBe(1);
    expect(db.versions.filter((v) => v.key === "status.3")).toHaveLength(1);
  });

  it("reports an unknown key", async () => {
    expect(await save({ key: "status.999" })).toEqual({ ok: false, code: "not_found" });
  });

  it("validates the layout as a layout (needs {{content}}, no subject)", async () => {
    expect(await save({ key: "layout", subject: "", body: "no slot" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await save({ key: "layout", subject: "", body: "<div>{{content}}</div>" })).toEqual({ ok: true, version: 2 });
  });
});

describe("restoreTemplate", () => {
  it("creates a new version holding the old text", async () => {
    const original = db.templates.find((t) => t.key === "status.3").body;
    await save();
    expect(await restoreTemplate(db, { shop: SHOP, key: "status.3", version: 1, expectedVersion: 2, reason: "Back", actor })).toEqual({ ok: true, version: 3 });
    expect(db.templates.find((t) => t.key === "status.3").body).toBe(original);
    expect(db.versions.find((v) => v.key === "status.3" && v.version === 3).reason).toContain("Restored version 1");
  });

  it("reports an unknown version, and a stale one", async () => {
    expect(await restoreTemplate(db, { shop: SHOP, key: "status.3", version: 9, expectedVersion: 1, reason: "x", actor })).toEqual({ ok: false, code: "not_found" });
    await save();
    expect(await restoreTemplate(db, { shop: SHOP, key: "status.3", version: 1, expectedVersion: 1, reason: "x", actor })).toEqual({ ok: false, code: "stale" });
  });
});

describe("listTemplates and getTemplate", () => {
  it("lists every template of the shop with who last edited it", async () => {
    await save();
    const list = await listTemplates(db, SHOP);
    expect(list.find((t) => t.key === "status.3")).toMatchObject({ version: 2, updatedByName: "Sam Patel" });
    expect(list.length).toBe(db.templates.length);
  });

  it("returns a template with its versions, newest first, or null", async () => {
    await save();
    const { template, versions } = await getTemplate(db, SHOP, "status.3");
    expect([template.version, versions.map((v) => v.version)]).toEqual([2, [2, 1]]);
    expect(await getTemplate(db, SHOP, "nope")).toBeNull();
  });
});
