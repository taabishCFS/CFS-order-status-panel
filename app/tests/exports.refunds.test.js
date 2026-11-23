import { beforeEach, describe, expect, it, vi } from "vitest";

let rows;
const exportRows = vi.fn(async () => rows);
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/refund-list.server", () => ({ exportRows: (...a) => exportRows(...a) }));

const route = await import("../routes/exports.refunds.jsx");
const { signExportLink } = await import("../orders/export-link.server.js");

const row = { createdAt: new Date("2026-11-20T14:30:00Z"), orderName: "#1001", orderCreatedAt: new Date("2026-11-10T09:00:00Z"), payMode: "shopify_payments", amountMinor: 2550, type: "part", reason: "DamagedPartRefund", notes: "Leg", refunded: "Yes", refundedAt: new Date("2026-11-21T10:00:00Z"), operator: "Sam", claimable: null, brands: ["Actona"], email: "a@b.com", billing: { name: "Ann Lee" } };
const open = (kind, query, secret = "secret") => route.loader({ request: new Request(`https://app.test/exports/refunds?t=${encodeURIComponent(signExportLink({ shop: "s.myshopify.com", kind, query }, secret))}`) });

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = "secret";
  rows = [row];
  exportRows.mockClear();
});

describe("GET /exports/refunds", () => {
  it("downloads the ticked rows as the legacy Refund export", async () => {
    const res = await open("refund-selected", "ids=r1%2Cr2");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="refund_export.csv"');
    expect(exportRows.mock.calls[0].slice(1)).toEqual(["s.myshopify.com", { ids: ["r1", "r2"] }]);
    const text = await res.text();
    expect(text.startsWith("Order Date,Added Date,Order Number")).toBe(true);
    expect(text).toContain("1001");
  });
  it("downloads everything the filters show", async () => {
    const res = await open("refund-filtered", "view=refunded&from=2026-11-01&to=2026-11-21");
    expect(exportRows.mock.calls[0][2].params).toMatchObject({ view: "refunded", from: "2026-11-01", to: "2026-11-21" });
    expect((await res.text()).startsWith("Order Number,Added Date")).toBe(true);
  });
  it("downloads the Xero credit notes for the refunded days", async () => {
    const res = await open("refund-xero", "from=2026-11-01&to=2026-11-21");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Refund-List_2026-11-01_2026-11-21.csv"');
    expect(exportRows.mock.calls[0][2]).toEqual({ refundedFrom: "2026-11-01", refundedTo: "2026-11-21" });
    expect((await res.text()).startsWith("ContactName,EmailAddress")).toBe(true);
  });
  it("refuses a link signed with another secret, a missing link, and an unknown kind", async () => {
    expect((await open("refund-selected", "ids=r1", "other")).status).toBe(403);
    expect((await route.loader({ request: new Request("https://app.test/exports/refunds") })).status).toBe(403);
    expect((await open("refund-zap", "")).status).toBe(400);
    expect((await open("refund-xero", "from=2026-11-01")).status).toBe(400);
    expect(exportRows).not.toHaveBeenCalled();
  });
});
