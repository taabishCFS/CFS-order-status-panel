import { describe, expect, it } from "vitest";
import { attachPhoto, issuesCsv, listIssues, parseIssueParams, readNewIssue, readStage, readValue, removePhoto, saveIssueField, stagePhoto, workOutFinal } from "./service-issues.server.js";

function fakeDb({ issues = [], stock = [], orders = [] } = {}) {
  const match = (r, where) => (where.AND ?? []).every((c) => Object.entries(c).every(([k, v]) => {
    if (k === "shop") return true;
    if (k === "OR") return v.some((o) => Object.entries(o).every(([kk, vv]) => String(r[kk] ?? "").toLowerCase().includes(vv.contains.toLowerCase())));
    if (v && typeof v === "object" && "in" in v) return v.in.includes(r[k]);
    if (v && typeof v === "object" && "gte" in v) return Boolean(r[k]) && r[k] >= v.gte && r[k] <= v.lte;
    return r[k] === v;
  }));
  return {
    issues,
    serviceIssue: {
      count: async ({ where }) => issues.filter((r) => match(r, where)).length,
      findMany: async ({ where, distinct, skip = 0, take = 1e9 }) => {
        if (distinct) return [...new Set(issues.map((r) => r[distinct[0]]).filter(Boolean))].sort().map((v) => ({ [distinct[0]]: v }));
        return issues.filter((r) => match(r, where)).sort((a, b) => (b.raisedDate ?? "").localeCompare(a.raisedDate ?? "") || b.id - a.id).slice(skip, skip + take);
      },
      findFirst: async ({ where }) => issues.find((r) => r.id === where.id) ?? null,
      create: async ({ data }) => { const row = { id: issues.length + 1, photos: [], ...data }; issues.push(row); return row; },
      update: async ({ where, data }) => Object.assign(issues.find((r) => r.id === where.id), data),
    },
    containerStock: {
      findMany: async ({ where, distinct }) => {
        let rows = stock.filter((s) => (!where.itemVendor || s.itemVendor === where.itemVendor) && (!where.productCode || where.productCode.in.includes(s.productCode)));
        if (distinct) rows = [...new Map(rows.map((s) => [s[distinct[0]], s])).values()];
        return rows;
      },
    },
    order: { findMany: async ({ where }) => orders.filter((o) => where.name.in.includes(o.name)) },
  };
}
const gql = (answers) => {
  const calls = [];
  const fn = async (query, { variables }) => { calls.push({ query, variables }); const a = answers.shift(); return { json: async () => ({ data: a }) }; };
  fn.calls = calls;
  return fn;
};

describe("Service Issue Report", () => {
  it("checks typed values", () => {
    expect(readValue("amount", "£1,234.5")).toEqual({ value: "1234.5" });
    expect(readValue("amount", "abc")).toEqual({ error: "bad_number" });
    expect(readValue("qty", "3")).toEqual({ value: 3 });
    expect(readValue("status", "Closed")).toEqual({ value: "Closed" });
    expect(readValue("status", "Shut")).toEqual({ error: "bad_request" });
    expect(readValue("chargeable", "Non Chargeable")).toEqual({ value: "Non Chargeable" });
    expect(readValue("raisedDate", "2026-02-30")).toEqual({ error: "bad_date" });
    expect(readValue("remark", "")).toEqual({ value: null });
    expect(readValue("nope", "x")).toEqual({ error: "bad_request" });
    expect(workOutFinal("100", "15.5")).toBe("84.50");
    expect(workOutFinal(null, "5")).toBe(null);
  });

  it("adds an issue: Item needed, Open and today by default, final price worked out", () => {
    expect(readNewIssue({ orderNo: "1038" }, "2026-11-28")).toEqual({ error: "item_needed", field: "item" });
    expect(readNewIssue({ item: "Sofa", price: "200", discount: "20" }, "2026-11-28")).toEqual({ value: { item: "Sofa", price: "200", discount: "20", finalPrice: "180.00", status: "Open", raisedDate: "2026-11-28" } });
  });

  it("lists with vendor, order link and filters", async () => {
    const db = fakeDb({
      issues: [
        { id: 1, shop: "s", raisedDate: "2026-11-20", item: "Sofa", code: "SF1", brand: "Acme", orderNo: "1038", status: "Open", photos: [] },
        { id: 2, shop: "s", raisedDate: "2026-11-25", item: "Bed", code: "BD1", brand: "Beds Co", status: "Closed", photos: [{ id: "gid://shopify/MediaImage/1", url: "https://cdn/x.jpg" }] },
      ],
      stock: [{ productCode: "SF1", itemVendor: "Zeta" }, { productCode: "SF1", itemVendor: "Alpha" }, { productCode: "BD1", itemVendor: "Beta" }],
      orders: [{ name: "#1038", orderId: "gid://shopify/Order/9" }],
    });
    const all = await listIssues(db, "s", parseIssueParams(new URLSearchParams("")));
    expect(all.rows.map((r) => r.id)).toEqual([2, 1]);
    expect(all.rows[1]).toMatchObject({ vendor: "Alpha", orderId: "gid://shopify/Order/9" });
    expect(all.brands).toEqual(["Acme", "Beds Co"]);
    const byVendor = await listIssues(db, "s", parseIssueParams(new URLSearchParams("vendor=Beta")));
    expect(byVendor.rows.map((r) => r.id)).toEqual([2]);
    const byDate = await listIssues(db, "s", parseIssueParams(new URLSearchParams("from=2026-11-19&to=2026-11-21&status=Open&q=sof")));
    expect(byDate.rows.map((r) => r.id)).toEqual([1]);
    const out = await issuesCsv(db, "s", parseIssueParams(new URLSearchParams("vendor=Beta")));
    expect(out.csv.split("\r\n")[1]).toContain("https://cdn/x.jpg");
  });

  it("saves one field and works the final price out again", async () => {
    const db = fakeDb({ issues: [{ id: 1, shop: "s", price: "100", discount: null, photos: [] }] });
    expect(await saveIssueField(db, "s", 1, "discount", "30", { name: "Ali" })).toEqual({ ok: true, finalPrice: "70.00" });
    expect(db.issues[0]).toMatchObject({ discount: "30", finalPrice: "70.00", updatedByName: "Ali" });
    expect(await saveIssueField(db, "s", 1, "remark", "Leg broken", { name: "Ali" })).toEqual({ ok: true });
    expect(await saveIssueField(db, "s", 9, "remark", "x", { name: "Ali" })).toEqual({ ok: false, error: "not_found" });
  });

  it("uploads, attaches and removes photos, up to 5", async () => {
    expect(readStage({ id: 1, filename: "a.pdf", mimeType: "application/pdf", size: 10 })).toEqual({ error: "not_image" });
    expect(readStage({ id: 1, filename: "a.jpg", mimeType: "image/jpeg", size: 30 * 1024 * 1024 })).toEqual({ error: "too_big" });
    const db = fakeDb({ issues: [{ id: 1, shop: "s", orderNo: "1038", photos: [] }] });
    const target = { url: "https://shopify-staged-uploads.storage.googleapis.com/", resourceUrl: "https://shopify-staged-uploads.storage.googleapis.com/tmp/1/a.jpg", parameters: [] };
    const g = gql([
      { stagedUploadsCreate: { stagedTargets: [target], userErrors: [] } },
      { fileCreate: { files: [{ id: "gid://shopify/MediaImage/5", fileStatus: "UPLOADED", image: null }], userErrors: [] } },
      { fileDelete: { deletedFileIds: ["gid://shopify/MediaImage/5"], userErrors: [] } },
    ]);
    expect(await stagePhoto(db, g, "s", { id: 1, filename: "a.jpg", mimeType: "image/jpeg", size: 100 })).toEqual({ ok: true, target });
    expect(g.calls[0].variables.input[0]).toMatchObject({ resource: "IMAGE", httpMethod: "POST", fileSize: "100" });
    expect(await attachPhoto(db, g, "s", { id: 1, resourceUrl: "https://evil.example.com/a.jpg" }, { name: "Ali" })).toEqual({ ok: false, error: "bad_request" });
    expect(await attachPhoto(db, g, "s", { id: 1, resourceUrl: target.resourceUrl, filename: "a.jpg" }, { name: "Ali" })).toEqual({ ok: true, photo: { id: "gid://shopify/MediaImage/5", url: null } });
    expect(g.calls[1].variables.files[0]).toMatchObject({ contentType: "IMAGE", alt: "Service issue 1 (order 1038)" });
    expect(await removePhoto(db, g, "s", { id: 1, fileId: "gid://shopify/MediaImage/5" }, { name: "Ali" })).toEqual({ ok: true });
    expect(db.issues[0].photos).toEqual([]);
    db.issues[0].photos = [1, 2, 3, 4, 5].map((n) => ({ id: `gid://shopify/MediaImage/${n}`, url: "u" }));
    expect(await stagePhoto(db, g, "s", { id: 1, filename: "a.jpg", mimeType: "image/jpeg", size: 100 })).toEqual({ ok: false, error: "photo_limit" });
  });
});
