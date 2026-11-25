import { describe, expect, it, vi } from "vitest";
import { archiveForOrder, cleanEntries, MAX_ENTRIES, olderForOrder, viaGraphql } from "./history-archive.server.js";

const entry = (id = "e1") => ({ id, at: "2026-11-25T10:00:00Z", by: { name: "A" }, scope: "lines", changes: [] });

describe("cleanEntries", () => {
  it("accepts real history entries", () => {
    expect(cleanEntries([entry()])).toHaveLength(1);
  });
  it("refuses anything else: not a list, empty, too many, wrong shape, unknown scope", () => {
    expect(cleanEntries(undefined)).toBeNull();
    expect(cleanEntries([])).toBeNull();
    expect(cleanEntries(Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => entry(String(i))))).toBeNull();
    expect(cleanEntries([{ id: "x" }])).toBeNull();
    expect(cleanEntries([{ ...entry(), scope: "admin" }])).toBeNull();
    expect(cleanEntries([{ ...entry(), id: "" }])).toBeNull();
    expect(cleanEntries([null])).toBeNull();
  });
});

describe("viaGraphql", () => {
  it("turns the browser-style call into an admin.graphql call", async () => {
    const graphql = vi.fn(async () => "res");
    const out = await viaGraphql(graphql)("shopify:admin/api/graphql.json", { body: JSON.stringify({ query: "q", variables: { a: 1 } }) });
    expect(out).toBe("res");
    expect(graphql).toHaveBeenCalledWith("q", { variables: { a: 1 } });
  });
});

describe("archiveForOrder / olderForOrder", () => {
  it("writes one metaobject per entry through the app's admin client", async () => {
    const graphql = vi.fn(async () => ({ json: async () => ({ data: { metaobjectUpsert: { userErrors: [] } } }) }));
    expect(await archiveForOrder(graphql, "gid://shopify/Order/5", [entry("a"), entry("b")])).toEqual({ ok: true });
    expect(graphql).toHaveBeenCalledTimes(2);
  });
  it("returns the reason when Shopify refuses", async () => {
    const graphql = vi.fn(async () => ({ json: async () => ({ errors: [{ message: "no" }] }) }));
    expect(await archiveForOrder(graphql, "gid://shopify/Order/5", [entry()])).toEqual({ ok: false, message: "no" });
  });
  it("reads a page of archived entries", async () => {
    const payload = JSON.stringify(entry("old"));
    const graphql = vi.fn(async () => ({ json: async () => ({ data: { metaobjects: { nodes: [{ fields: [{ key: "payload", value: payload }] }], pageInfo: { hasNextPage: false, endCursor: null } } } }) }));
    const page = await olderForOrder(graphql, "gid://shopify/Order/5", null);
    expect(page.entries.map((e) => e.id)).toEqual(["old"]);
  });
});
