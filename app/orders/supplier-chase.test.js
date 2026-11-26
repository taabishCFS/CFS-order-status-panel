import { beforeEach, describe, expect, it } from "vitest";
import { fakeEmailDb } from "../email/fixtures";
import { listChase, listSuppliers, queueSupplierEmails, saveSupplier } from "./supplier-chase.server.js";
import { addDays, buildChaseWhere, cleanEmails, expectedWindow, parseChaseParams, planSupplierEmails, readContactInput, readProcessRequest, ukToday } from "./supplier-chase-rules.js";

const SHOP = "s.myshopify.com";
const actor = { id: "9", name: "Sam Patel", source: "verified" };
const config = { enabled: true, mode: "log", internalCopyTo: "", fromAddress: "orders@orders.cfsonline.co.uk" };
const O = (n) => `gid://shopify/Order/${n}`;
const L = (n) => `gid://shopify/LineItem/${n}`;
const NOW = new Date("2026-11-30T10:00:00Z");

describe("dates", () => {
  it("knows today in the UK and moves a date by days", () => {
    expect(ukToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01"); // British summer time is already the next day
    expect(ukToday(NOW)).toBe("2026-11-30");
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("chaseup: a range, one exact day, or three days ahead", () => {
    expect(expectedWindow("chaseup", { from: "2026-12-01", to: "2026-12-05" }, NOW)).toEqual({ gte: "2026-12-01", lte: "2026-12-05" });
    expect(expectedWindow("chaseup", { from: "2026-12-01", to: null }, NOW)).toEqual({ equals: "2026-12-01" });
    expect(expectedWindow("chaseup", { from: null, to: "2026-12-04" }, NOW)).toEqual({ equals: "2026-12-04" });
    expect(expectedWindow("chaseup", { from: null, to: null }, NOW)).toEqual({ equals: "2026-12-03" });
  });
  it("lapsed: a range, or everything due up to today", () => {
    expect(expectedWindow("lapsed", { from: "2026-11-01", to: "2026-11-20" }, NOW)).toEqual({ gte: "2026-11-01", lte: "2026-11-20" });
    expect(expectedWindow("lapsed", { from: "2026-11-01", to: null }, NOW)).toEqual({ lte: "2026-11-30" });
  });
});

describe("reading requests", () => {
  it("reads the list query string and ignores rubbish", () => {
    const p = parseChaseParams(new URLSearchParams("kind=lapsed&brand=%20Actona%20&from=2026-02-30&to=2026-12-01&page=0"));
    expect(p).toEqual({ kind: "lapsed", brand: "Actona", from: null, to: "2026-12-01", page: 1, all: false });
    expect(parseChaseParams(new URLSearchParams("kind=x")).kind).toBe("chaseup");
  });
  it("picks the right statuses for each list", () => {
    const chase = buildChaseWhere(SHOP, { kind: "chaseup", brand: "Actona", from: null, to: null }, NOW);
    expect(chase.AND).toContainEqual({ lineStatusId: { in: [3, 10, 15, 16] } });
    expect(chase.AND).toContainEqual({ vendor: "Actona" });
    expect(buildChaseWhere(SHOP, { kind: "lapsed", brand: null, from: null, to: null }, NOW).AND).toContainEqual({ lineStatusId: { in: [3, 10, 13, 57, 15] } });
  });
  it("accepts one or a few email addresses and refuses anything else", () => {
    expect(cleanEmails(" A@x.com ; b@y.co.uk, a@x.com")).toBe("a@x.com, b@y.co.uk");
    expect(cleanEmails("")).toBe("");
    expect(cleanEmails("not an email")).toBeNull();
    expect(cleanEmails("a@x.com, b@x.com, c@x.com, d@x.com", 3)).toBeNull();
  });
  it("reads a supplier save", () => {
    expect(readContactInput({ brand: " Actona ", email: "o@a.com", cc: "", handOrdered: true })).toEqual({ value: { brand: "Actona", email: "o@a.com", cc: "", handOrdered: true, address: "" } });
    expect(readContactInput({ brand: "", email: "" })).toEqual({ error: "bad_request" });
    expect(readContactInput({ brand: "A", email: "nope" })).toEqual({ error: "bad_email" });
    expect(readContactInput({ brand: "A", handOrdered: "yes" })).toEqual({ error: "bad_request" });
  });
  it("reads a process request: lines or orders, never both", () => {
    const ok = readProcessRequest({ action: "order", lineIds: [L(1), L(1)], idempotencyKey: "k" });
    expect(ok.value).toMatchObject({ action: "order", lineIds: [L(1)], orderIds: null, dryRun: false });
    expect(readProcessRequest({ action: "order", orderIds: [O(1)], idempotencyKey: "k" }).value.orderIds).toEqual([O(1)]);
    expect(readProcessRequest({ action: "order", lineIds: [L(1)], orderIds: [O(1)], idempotencyKey: "k" }).error).toBe("bad_request");
    expect(readProcessRequest({ action: "chaseup", orderIds: [O(1)], idempotencyKey: "k" }).error).toBe("bad_request");
    expect(readProcessRequest({ action: "x", lineIds: [L(1)], idempotencyKey: "k" }).error).toBe("bad_request");
    expect(readProcessRequest({ action: "order", lineIds: ["bad"], idempotencyKey: "k" }).error).toBe("bad_request");
    expect(readProcessRequest({ action: "order", lineIds: [L(1)] }).error).toBe("bad_request");
  });
});

describe("planSupplierEmails", () => {
  const line = (n, order, vendor, status = 1) => ({ lineId: L(n), orderId: O(order), vendor, lineStatusId: status });
  const contacts = new Map([["Welcome", { email: "w@x.com" }], ["Actona", { email: "a@x.com", handOrdered: true }], ["Other", { email: "o@x.com" }]]);
  const lines = [line(1, 1, "Welcome"), line(2, 1, "Welcome"), line(3, 2, "Welcome"), line(4, 1, "Actona"), line(5, 1, "Nobody"), line(6, 1, "Other", 40), line(7, 3, null)];
  it("order: one email per order and brand; hand-ordered, unknown suppliers and not-orderable lines are left out", () => {
    const plan = planSupplierEmails({ action: "order", lines, contacts });
    expect([...plan.emails.keys()]).toEqual([`${O(1)}|Welcome`, `${O(2)}|Welcome`]);
    expect(plan.emails.get(`${O(1)}|Welcome`).lines).toHaveLength(2);
    expect(plan.handOrdered).toEqual([L(4)]);
    expect(plan.noSupplier).toEqual(["Nobody", "Unmapped"]);
    expect(plan.skipped).toEqual([L(6)]);
  });
  it("chaseup: one email per brand across orders", () => {
    const plan = planSupplierEmails({ action: "chaseup", lines, contacts });
    expect([...plan.emails.keys()]).toEqual(["Welcome"]);
    expect(plan.emails.get("Welcome").lines).toHaveLength(3);
  });
});

function chaseDb({ lines = [], orders = [], contacts = [], chases = [] } = {}) {
  const db = fakeEmailDb();
  const seen = {};
  db.orderLine = {
    groupBy: async ({ where }) => { seen.where = where; const m = new Map(); for (const l of lines) m.set(l.orderId, (m.get(l.orderId) ?? 0) + 1); return [...m].map(([orderId, n]) => ({ orderId, _count: { _all: n } })); },
    findMany: async ({ where }) => (where.lineId?.in ? lines.filter((l) => where.lineId.in.includes(l.lineId)) : where.orderId?.in ? lines.filter((l) => where.orderId.in.includes(l.orderId)) : lines),
  };
  db.order = { findMany: async ({ where }) => orders.filter((o) => where.orderId.in.includes(o.orderId)) };
  db.supplierContact = {
    findMany: async ({ where }) => (where.brand ? contacts.filter((c) => where.brand.in.includes(c.brand)) : contacts),
    upsert: async ({ where, create, update }) => { const f = contacts.find((c) => c.brand === where.shop_brand.brand); if (f) Object.assign(f, update); else contacts.push({ ...create }); },
  };
  db.lineChase = {
    findMany: async () => chases,
    upsert: async ({ where, create, update }) => { const f = chases.find((c) => c.lineId === where.shop_lineId.lineId); if (f) Object.assign(f, update); else chases.push({ ...create }); },
  };
  db.seen = seen;
  db.chases = chases;
  db.contacts = contacts;
  return db;
}

describe("listChase", () => {
  it("lists the lines with order number, brand and last chase-up, and counts lines and orders", async () => {
    const lines = [
      { lineId: L(1), orderId: O(1), vendor: "Welcome", title: "Bed", variantTitle: "4ft6", quantity: 1, lineStatusId: 3, expectedDate: "2026-12-03", deliveryOutcome: null, orderCreatedAt: new Date("2026-11-20") },
      { lineId: L(2), orderId: O(1), vendor: null, title: "Chair", variantTitle: null, quantity: 2, lineStatusId: 10, expectedDate: "2026-12-03", deliveryOutcome: null, orderCreatedAt: new Date("2026-11-20") },
    ];
    const db = chaseDb({ lines, orders: [{ orderId: O(1), name: "#1001" }], chases: [{ lineId: L(1), lastChasedAt: new Date("2026-11-29T09:00:00Z") }] });
    const r = await listChase(db, SHOP, { kind: "chaseup", brand: null, from: null, to: null, page: 1, all: false }, NOW);
    expect(r.summary).toEqual({ lines: 2, orders: 1 });
    expect(r.rows[0]).toMatchObject({ orderName: "#1001", brand: "Welcome", lastChasedAt: "2026-11-29T09:00:00.000Z" });
    expect(r.rows[1]).toMatchObject({ brand: "Unmapped", lastChasedAt: null });
    expect(db.seen.where.AND).toContainEqual({ expectedDate: { equals: "2026-12-03" } });
  });
});

describe("suppliers", () => {
  it("lists every brand seen on a line or saved, with details, and saves one", async () => {
    const db = chaseDb({ contacts: [{ brand: "Saved Only", email: "s@x.com", cc: null, handOrdered: false }] });
    db.orderLine.findMany = async () => [{ vendor: "Actona" }, { vendor: null }];
    expect(await listSuppliers(db, SHOP)).toEqual([
      { brand: "Actona", email: "", cc: "", handOrdered: false, address: "" },
      { brand: "Saved Only", email: "s@x.com", cc: "", handOrdered: false, address: "" },
      { brand: "Unmapped", email: "", cc: "", handOrdered: false, address: "" },
    ]);
    await saveSupplier(db, SHOP, { brand: "Actona", email: "a@x.com", cc: "", handOrdered: true }, actor);
    expect(db.contacts.find((c) => c.brand === "Actona")).toMatchObject({ email: "a@x.com", cc: null, handOrdered: true, updatedBy: "Sam Patel" });
  });
});

describe("queueSupplierEmails", () => {
  const lines = [
    { shop: SHOP, lineId: L(1), orderId: O(1), vendor: "Welcome", title: "Bed", variantTitle: "4ft6", quantity: 1, lineStatusId: 1, properties: [] },
    { shop: SHOP, lineId: L(2), orderId: O(2), vendor: "Welcome", title: "Chair", variantTitle: null, quantity: 2, lineStatusId: 1, properties: [] },
    { shop: SHOP, lineId: L(3), orderId: O(1), vendor: "Actona", title: "Sofa", variantTitle: null, quantity: 1, lineStatusId: 1, properties: [] },
    { shop: SHOP, lineId: L(4), orderId: O(1), vendor: "Nobody", title: "Rug", variantTitle: null, quantity: 1, lineStatusId: 1, properties: [] },
  ];
  const orders = [{ shop: SHOP, orderId: O(1), name: "#1001", site: null }, { shop: SHOP, orderId: O(2), name: "#1002", site: null }];
  const contacts = () => [{ brand: "Welcome", email: "w@x.com", cc: "boss@x.com", handOrdered: false }, { brand: "Actona", email: null, cc: null, handOrdered: true }];
  const run = (db, req, cfg = config) => queueSupplierEmails(db, { shop: SHOP, request: { dryRun: false, orderIds: null, idempotencyKey: "k1", ...req }, actor, config: cfg, now: NOW });
  let db;
  beforeEach(() => { db = chaseDb({ lines, orders, contacts: contacts() }); });

  it("process order: one order form per order and brand, to the supplier and the copy address", async () => {
    const r = await run(db, { action: "order", lineIds: [L(1), L(2), L(3), L(4)] });
    expect(r).toMatchObject({ ok: true, emails: 2, orders: 2, handOrdered: 1, noSupplier: ["Nobody"] });
    expect(r.processedLines.map((x) => x.lineId).sort()).toEqual([L(1), L(2), L(3)]); // emailed lines and the hand-ordered one; not the line with no supplier
    const rows = db.rows;
    expect(rows).toHaveLength(4); // two emails, each to the supplier and the copy address
    expect(rows.map((x) => x.recipient).sort()).toEqual(["boss@x.com", "boss@x.com", "w@x.com", "w@x.com"]);
    expect(rows[0]).toMatchObject({ kind: "supplier", templateKey: "supplier.order_form", status: "queued", actorName: "Sam Patel" });
    expect(rows[0].html).toContain("Welcome");
    expect(rows[0].html).toContain("Bed");
    expect(db.chases).toHaveLength(0); // an order form is not a chase-up
  });

  it("process order for whole orders takes every line of the order", async () => {
    const r = await run(db, { action: "order", orderIds: [O(1)] });
    expect(r).toMatchObject({ ok: true, emails: 1, handOrdered: 1, noSupplier: ["Nobody"] });
  });

  it("chase-up: one email per brand listing every order, and stamps the last chase-up date", async () => {
    const r = await run(db, { action: "chaseup", lineIds: [L(1), L(2)] });
    expect(r).toMatchObject({ ok: true, emails: 1, orders: 2, processedLines: [{ lineId: L(1), orderId: O(1) }, { lineId: L(2), orderId: O(2) }] });
    const html = db.rows[0].html;
    expect(db.rows[0].templateKey).toBe("supplier.chaseup");
    expect(html).toContain("#1001 Bed");
    expect(html).toContain("#1002 Chair");
    expect(db.chases.map((c) => c.lineId).sort()).toEqual([L(1), L(2)]);
    expect(db.chases[0]).toMatchObject({ chasedByName: "Sam Patel" });
  });

  it("a preview sends nothing and changes nothing", async () => {
    const r = await run(db, { action: "chaseup", lineIds: [L(1)], dryRun: true });
    expect(r).toMatchObject({ ok: true, emails: 1 });
    expect(db.rows).toHaveLength(0);
    expect(db.chases).toHaveLength(0);
  });

  it("sending the same request twice sends once and stamps once", async () => {
    await run(db, { action: "chaseup", lineIds: [L(1)] });
    const again = await run(db, { action: "chaseup", lineIds: [L(1)] });
    expect(again.duplicate).toBe(true);
    expect(db.rows).toHaveLength(2);
  });

  it("refuses when email is off, or no line is found", async () => {
    expect(await run(db, { action: "order", lineIds: [L(1)] }, { ...config, enabled: false })).toEqual({ ok: false, code: "email_off" });
    expect(await run(db, { action: "order", lineIds: [L(99)] })).toEqual({ ok: false, code: "no_lines" });
  });

  it("only hand-ordered lines: nothing is emailed but they still go to Order in Progress", async () => {
    const r = await run(db, { action: "order", lineIds: [L(3)] });
    expect(r).toMatchObject({ ok: true, emails: 0, handOrdered: 1, processedLines: [{ lineId: L(3), orderId: O(1) }] });
    expect(db.rows).toHaveLength(0);
  });

  it("copies the internal address when one is set", async () => {
    await run(db, { action: "chaseup", lineIds: [L(1)] }, { ...config, internalCopyTo: "office@x.com" });
    expect(db.rows.filter((x) => x.kind === "internal_copy")).toHaveLength(1);
  });
});
