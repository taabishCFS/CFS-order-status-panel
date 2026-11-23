import { beforeEach, describe, expect, it, vi } from "vitest";

let admin;
let docs;
vi.mock("../shopify.server", () => ({ authenticate: { admin: (...a) => admin(...a) }, unauthenticated: { admin: async () => ({ admin: { graphql: "gql" } }) } }));
vi.mock("../db.server", () => ({ default: {} }));
vi.mock("../orders/documents.server", () => ({ loadDocument: (...a) => docs.load(...a), logDeliveryNote: (...a) => docs.log(...a), deliveryNoteLog: (...a) => docs.list(...a) }));

process.env.SHOPIFY_API_SECRET = "secret";
process.env.SHOPIFY_APP_URL = "https://app.test";
const api = await import("../routes/api.orders.$id.document.jsx");
const page = await import("../routes/exports.document.jsx");
const { shapeDocOrder } = await import("../orders/documents");

const session = (over = {}) => ({ shop: "s.myshopify.com", isOnline: true, onlineAccessInfo: { associated_user: { id: 9, first_name: "Sam", last_name: "Patel" } }, ...over });
const get = (qs) => new Request(`https://app.test/api/orders/5/document?${qs}`);
const money = (a) => ({ shopMoney: { amount: a, currencyCode: "GBP" } });
const order = (balance = "0.0") => ({
  name: "#5", createdAt: "2026-11-22T10:00:00Z", tags: [], currentTotalPriceSet: money("10.0"), totalReceivedSet: money("10.0"), totalOutstandingSet: money(balance),
  shippingAddress: { name: "A B", address1: "1 Road", city: "Town", zip: "T1", country: "UK" },
  lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", title: "Bed", quantity: 1, currentQuantity: 1, originalUnitPriceSet: money("10.0"), customAttributes: [], discountAllocations: [] }] },
  metafield: { value: JSON.stringify({ lines: { "gid://shopify/LineItem/1": { statusId: 4 } } }) },
});
const found = (balance) => ({ doc: shapeDocOrder(order(balance), JSON.stringify({ lines: { "gid://shopify/LineItem/1": { statusId: 4 } } })), site: { name: "CFS", url: "u", email: "e", phone: "p", logoUrl: "" } });

beforeEach(() => {
  admin = async () => ({ session: session(), admin: { graphql: "gql" }, cors: (r) => r });
  docs = { load: vi.fn(async () => found("0.0")), log: vi.fn(async () => ({})), list: vi.fn(async () => [{ at: "2026-11-22T10:00:00.000Z", by: "Ann" }]) };
});

const token = (url) => new URL(url).searchParams.get("t");

describe("GET /api/orders/:id/document", () => {
  it("gives a signed link for an invoice without touching Shopify", async () => {
    const res = await api.loader({ request: get("kind=inc-vat"), params: { id: "5" } });
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/app\.test\/exports\/document\?t=/);
    expect(docs.load).not.toHaveBeenCalled();
  });
  it("gives the delivery note link and logs who opened it", async () => {
    const res = await api.loader({ request: get("kind=delivery-note"), params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(docs.log.mock.calls[0][1]).toMatchObject({ shop: "s.myshopify.com", orderId: "gid://shopify/Order/5", staff: { name: "Sam Patel" } });
  });
  it("refuses the delivery note with a balance owed, and logs nothing", async () => {
    docs.load = vi.fn(async () => found("5.0"));
    const res = await api.loader({ request: get("kind=delivery-note"), params: { id: "5" } });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/balance/);
    expect(docs.log).not.toHaveBeenCalled();
  });
  it("needs ticked lines and a type for a return label", async () => {
    expect((await api.loader({ request: get("kind=return-label&type=Free_Stock"), params: { id: "5" } })).status).toBe(400);
    expect((await api.loader({ request: get("kind=return-label&lineIds=gid://shopify/LineItem/1&type=Nope"), params: { id: "5" } })).status).toBe(400);
    expect((await api.loader({ request: get("kind=return-label&lineIds=gid://shopify/LineItem/1&type=Free_Stock"), params: { id: "5" } })).status).toBe(200);
  });
  it("lists the delivery notes log", async () => {
    expect(await (await api.loader({ request: get("log=1"), params: { id: "5" } })).json()).toEqual({ log: [{ at: "2026-11-22T10:00:00.000Z", by: "Ann" }] });
  });
  it("refuses unverified staff, an unknown kind and a bad id", async () => {
    admin = async () => ({ session: session({ isOnline: false }), admin: {}, cors: (r) => r });
    expect((await api.loader({ request: get("kind=label"), params: { id: "5" } })).status).toBe(403);
    admin = async () => ({ session: session(), admin: {}, cors: (r) => r });
    expect((await api.loader({ request: get("kind=zzz"), params: { id: "5" } })).status).toBe(400);
    expect((await api.loader({ request: get("kind=label"), params: { id: "x" } })).status).toBe(400);
  });
});

describe("GET /exports/document", () => {
  const link = async (qs) => token((await (await api.loader({ request: get(qs), params: { id: "5" } })).json()).url);
  const open = (t) => page.loader({ request: new Request(`https://app.test/exports/document?t=${encodeURIComponent(t)}`) });

  it("serves each document as a page", async () => {
    const t = await link("kind=exc-vat");
    const res = await open(t);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Invoice #5");
    expect(await (await open(await link("kind=label"))).text()).toContain("1 Road");
    expect(await (await open(await link("kind=return-label&lineIds=gid://shopify/LineItem/1&type=Free_Stock"))).text()).toContain("Free Stock");
  });
  it("refuses a bad link and a missing order", async () => {
    expect((await open("junk")).status).toBe(403);
    docs.load = vi.fn(async () => null);
    expect((await open(await link("kind=label"))).status).toBe(404);
  });
});
