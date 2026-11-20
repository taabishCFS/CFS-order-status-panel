import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let svc;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) } }));
vi.mock("../db.server", () => ({ default: { marker: "db" } }));
vi.mock("../orders/supplier-invoice.server", () => ({ getSupplierInvoices: (...a) => svc.get(...a), saveSupplierInvoice: (...a) => svc.save(...a) }));

const route = await import("../routes/api.orders.$id.supplier-invoices.jsx");

const L = "gid://shopify/LineItem/1";
const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const post = (body) => new Request("https://app.test/api/orders/5/supplier-invoices", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { lineId: L, invoiceDate: "2026-11-20", invoiceNumber: "INV-1", amount: "12.50", paid: true };

beforeEach(() => {
  admin = async () => ({ session: session(), cors: (r) => r });
  svc = {
    get: vi.fn(async () => ({ [L]: { invoiceNumber: "INV-1", paid: true } })),
    save: vi.fn(async () => ({ ok: true, invoice: { invoiceNumber: "INV-1", paid: true } })),
  };
});

describe("GET /api/orders/:id/supplier-invoices", () => {
  it("returns the saved invoices of the order", async () => {
    const res = await route.loader({ request: new Request("https://app.test/x"), params: { id: "5" } });
    expect(await res.json()).toEqual({ invoices: { [L]: { invoiceNumber: "INV-1", paid: true } } });
    expect(svc.get.mock.calls[0].slice(1)).toEqual(["s.myshopify.com", "gid://shopify/Order/5"]);
  });
  it("refuses an order id that is not a number", async () => {
    const res = await route.loader({ request: new Request("https://app.test/x"), params: { id: "abc" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/orders/:id/supplier-invoices", () => {
  it("saves one line's invoice as the verified staff member", async () => {
    const res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, invoice: { invoiceNumber: "INV-1", paid: true } });
    expect(svc.save.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/5", actor: { name: "Sam Patel" }, input: { lineId: L, amountMinor: 1250, paid: true } });
  });

  it("says when the line is not on the order", async () => {
    svc.save = vi.fn(async () => ({ ok: false, code: "no_line" }));
    const res = await route.action({ request: post(good), params: { id: "5" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_line" });
  });

  it("refuses an unverified person, a bad body, a bad id and a wrong method without saving", async () => {
    admin = async () => ({ session: session({ isOnline: false, onlineAccessInfo: undefined }), cors: (r) => r });
    expect((await route.action({ request: post(good), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), cors: (r) => r });
    expect((await route.action({ request: post("nope"), params: { id: "5" } })).status).toBe(400);
    expect((await route.action({ request: post({ ...good, amount: "-1" }), params: { id: "5" } })).status).toBe(400);
    expect((await route.action({ request: post(good), params: { id: "x" } })).status).toBe(400);
    expect((await route.action({ request: new Request("https://app.test/x", { method: "PUT" }), params: { id: "5" } })).status).toBe(405);
    expect(svc.save).not.toHaveBeenCalled();
  });
});
