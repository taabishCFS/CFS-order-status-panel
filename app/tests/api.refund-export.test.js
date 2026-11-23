import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));

const route = await import("../routes/api.refund-export.jsx");
const { verifyExportLink } = await import("../orders/export-link.server.js");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const get = (q) => route.loader({ request: new Request(`https://app.test/api/refund-export?${q}`) });
const tokenOf = (url) => new URL(url).searchParams.get("t");

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = "secret";
  process.env.SHOPIFY_APP_URL = "https://app.test/";
  admin = async () => ({ session: session(), cors: (r) => r });
});

describe("GET /api/refund-export", () => {
  it("gives a signed link for the ticked rows", async () => {
    const { url, filename } = await (await get("kind=selected&ids=r1,r2")).json();
    expect(filename).toBe("refund_export.csv");
    expect(verifyExportLink(tokenOf(url), "secret")).toMatchObject({ ok: true, shop: "s.myshopify.com", kind: "refund-selected", query: "ids=r1%2Cr2" });
    expect(url.startsWith("https://app.test/exports/refunds?t=")).toBe(true);
  });
  it("gives a link for the whole filtered list, keeping the filters but not the page", async () => {
    const { url } = await (await get("kind=filtered&view=refunded&from=2026-11-01&to=2026-11-21&page=3")).json();
    const v = verifyExportLink(tokenOf(url), "secret");
    expect(v.kind).toBe("refund-filtered");
    expect(new URLSearchParams(v.query).get("view")).toBe("refunded");
    expect(new URLSearchParams(v.query).has("page")).toBe(false);
  });
  it("names the Xero file after the two days and needs both", async () => {
    expect((await (await get("kind=xero&from=2026-11-01&to=2026-11-21")).json()).filename).toBe("Refund-List_2026-11-01_2026-11-21.csv");
    expect((await get("kind=xero&from=2026-11-01")).status).toBe(400);
  });
  it("refuses a bad kind, no ids, and staff Shopify will not name", async () => {
    expect((await get("kind=zap")).status).toBe(400);
    expect((await get("kind=selected")).status).toBe(400);
    admin = async () => ({ session: session({ onlineAccessInfo: undefined }), cors: (r) => r });
    expect((await get("kind=selected&ids=r1")).status).toBe(403);
  });
});
