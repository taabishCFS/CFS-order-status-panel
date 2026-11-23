import { describe, expect, it } from "vitest";
import { PAGE_SIZE, buildRefundWhere, claimableApplies, filteredCsv, paidMinor, parseRefundListParams, readManualInput, readRefundAction, refundOrderBy, selectedCsv, viewOf, xeroCsv } from "./refund-list.js";

const sp = (q) => new URLSearchParams(q);

describe("parseRefundListParams", () => {
  it("reads page, dates, search, view and sort, and ignores junk", () => {
    expect(parseRefundListParams(sp("page=3&from=2026-11-01&to=2026-11-21&q= 1001 &view=refunded&sort=amount&dir=asc"))).toEqual({
      page: 3, all: false, from: "2026-11-01", to: "2026-11-21", q: "1001", view: "refunded", sort: "amount", dir: "asc",
    });
    expect(parseRefundListParams(sp("page=-2&from=2026-02-31&view=zzz&sort=zzz&dir=zzz"))).toEqual({ page: 1, all: false, from: null, to: null, q: "", view: null, sort: null, dir: "desc" });
    expect(parseRefundListParams(sp("all=1")).all).toBe(true);
  });
});

describe("viewOf (legacy: pending by default, every state when searching by order number)", () => {
  it("defaults to pending, shows everything for a search, and obeys a chosen view", () => {
    expect(viewOf({ view: null, q: "" })).toBe("pending");
    expect(viewOf({ view: null, q: "1001" })).toBe("all");
    expect(viewOf({ view: "refunded", q: "1001" })).toBe("refunded");
  });
});

describe("buildRefundWhere", () => {
  it("shows pending requests only by default and never removed ones", () => {
    expect(buildRefundWhere("s", { view: null, q: "", from: null, to: null })).toEqual({ shop: "s", AND: [{ status: "requested" }] });
  });
  it("refunded view shows done", () => {
    expect(buildRefundWhere("s", { view: "refunded", q: "", from: null, to: null }).AND).toEqual([{ status: "done" }]);
  });
  it("a search matches the order number exactly, with or without #, across pending and refunded", () => {
    const w = buildRefundWhere("s", { view: null, q: "#1001", from: null, to: null });
    expect(w.AND).toEqual([{ status: { in: ["requested", "done"] } }, { orderName: { in: ["#1001", "1001"] } }]);
  });
  it("a date range is on the day the request was added, to the end of the last day", () => {
    const w = buildRefundWhere("s", { view: null, q: "", from: "2026-11-01", to: "2026-11-21" });
    expect(w.AND[1]).toEqual({ createdAt: { gte: new Date("2026-11-01T00:00:00.000Z"), lte: new Date("2026-11-21T23:59:59.999Z") } });
  });
});

describe("refundOrderBy", () => {
  it("newest added first for pending, newest refunded first for refunded, and a chosen sort wins", () => {
    expect(refundOrderBy({ view: null, q: "", sort: null, dir: "desc" })).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(refundOrderBy({ view: "refunded", q: "", sort: null, dir: "desc" })).toEqual([{ refundedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    expect(refundOrderBy({ view: null, q: "", sort: "amount", dir: "asc" })).toEqual([{ amountMinor: "asc" }, { id: "desc" }]);
    expect(refundOrderBy({ view: null, q: "", sort: "order", dir: "asc" })).toEqual([{ orderName: "asc" }, { id: "desc" }]);
  });
  it("exports a page size of 50", () => expect(PAGE_SIZE).toBe(50));
});

describe("paidMinor (legacy: the paid amount when part paid, else the order total)", () => {
  it("uses total less outstanding when something is outstanding", () => {
    expect(paidMinor({ totalMinor: 10000, outstandingMinor: 4000 })).toBe(6000);
    expect(paidMinor({ totalMinor: 10000, outstandingMinor: 0 })).toBe(10000);
  });
});

describe("claimableApplies", () => {
  it("is true only for damaged and manufacturing-defect reasons", () => {
    expect(claimableApplies("DamagedPartRefund")).toBe(true);
    expect(claimableApplies("ManufacturingDefectFullRefund")).toBe(true);
    expect(claimableApplies("Change_of_Mind")).toBe(false);
  });
});

const row = (over = {}) => ({
  createdAt: new Date("2026-11-20T14:30:00Z"), orderName: "#1001", orderCreatedAt: new Date("2026-11-10T09:00:00Z"), payMode: "shopify_payments",
  amountMinor: 2550, type: "part", reason: "DamagedPartRefund", notes: "Leg, snapped", refunded: "Yes", refundedAt: new Date("2026-11-21T10:00:00Z"),
  operator: "Sam", claimable: "claimable", brands: ["Actona", "Hygena"], email: "A@B.com", billing: { name: "Ann Lee", address1: "1 High St", address2: "Flat 2", city: "Leeds", province: "West Yorkshire", zip: "LS1 1AA", countryCodeV2: "GB" }, ...over,
});

describe("selectedCsv (legacy Refund export of ticked rows)", () => {
  it("has the legacy headings and one row per refund", () => {
    const lines = selectedCsv([row()]).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Order Date,Added Date,Order Number,Pay Mode,Refund Amount,Payment Type,Refund Reason,Refund Notes,Refunded?,Refund Date,Operator,Claimable Amt,Brands");
    expect(lines[1]).toBe('10/11/2026,2026-11-20 14:30:00,1001,shopify_payments,25.50,Part Payment,DamagedPartRefund,"Leg, snapped",Yes,21/11/2026,Sam,Claimable,"Actona, Hygena"');
  });
  it("says Full Payment for a full refund, Non Claimable, and leaves dates and claim blank when there are none", () => {
    const line = selectedCsv([row({ type: "full", claimable: "non_claimable", refunded: "", refundedAt: null })]).trimEnd().split("\r\n")[1];
    expect(line).toContain("Full Payment");
    expect(line).toContain("Non Claimable");
    expect(line).toContain(",,,Sam,"); // refunded and refund date both blank
    expect(selectedCsv([row({ claimable: null })]).trimEnd().split("\r\n")[1]).toContain(",Sam,,");
  });
});

describe("filteredCsv (legacy Refund export of the whole filtered list)", () => {
  it("is the same without the order date column, order number first", () => {
    const lines = filteredCsv([row()]).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Order Number,Added Date,Pay Mode,Refund Amount,Payment Type,Refund Reason,Refund Notes,Refunded?,Refund Date,Operator,Claimable Amt,Brands");
    expect(lines[1].startsWith("1001,2026-11-20 14:30:00,shopify_payments,25.50,Part Payment")).toBe(true);
  });
});

describe("xeroCsv (legacy Export Refund By Date, credit notes for Xero)", () => {
  it("has the Xero headings and a negative unit amount with the 20% VAT on income tax type", () => {
    const lines = xeroCsv([row()]).trimEnd().split("\r\n");
    expect(lines[0]).toBe("ContactName,EmailAddress,POAddressLine1,POAddressLine2,POAddressLine3,POAddressLine4,POCity,PORegion,POPostalCode,POCountry,InvoiceNumber,Reference,InvoiceDate,DueDate,Total,InventoryItemCode,Description,Quantity,UnitAmount,Discount,AccountCode,TaxType,TaxAmount,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2,Currency,BrandingTheme");
    expect(lines[1]).toBe('Ann Lee,a@b.com,1 High St,Flat 2,,,Leeds,West Yorkshire,LS1 1AA,GB,1001R,,21/11/2026,21/11/2026,,,"Leg, snapped",1,-25.50,,200,20% (VAT on Income),,,,,,,');
  });
});

describe("readManualInput (legacy Add Order form: reason, type, order no, amount and notes are all required)", () => {
  const ok = { clientKey: "k1", orderName: " #1001 ", reason: "DelayRefund", type: "part", amount: "£25.50", notes: " Phoned in ", transactionId: " TX-1 " };
  it("cleans a good entry", () => {
    expect(readManualInput(ok)).toEqual({ value: { clientKey: "k1", orderName: "1001", reason: "DelayRefund", type: "part", amountMinor: 2550, notes: "Phoned in", transactionId: "TX-1" } });
    expect(readManualInput({ ...ok, transactionId: undefined }).value.transactionId).toBe("");
  });
  it("names what is wrong, in the legacy order", () => {
    expect(readManualInput({ ...ok, reason: "nope" })).toEqual({ error: "bad_reason" });
    expect(readManualInput({ ...ok, type: "x" })).toEqual({ error: "bad_type" });
    expect(readManualInput({ ...ok, orderName: "  " })).toEqual({ error: "bad_order" });
    expect(readManualInput({ ...ok, amount: "" })).toEqual({ error: "bad_amount" });
    expect(readManualInput({ ...ok, amount: "0" })).toEqual({ error: "bad_amount" });
    expect(readManualInput({ ...ok, amount: "12.345" })).toEqual({ error: "bad_amount" });
    expect(readManualInput({ ...ok, notes: " " })).toEqual({ error: "bad_notes" });
    expect(readManualInput({ ...ok, notes: "x".repeat(1001) })).toEqual({ error: "bad_notes" });
    expect(readManualInput({ ...ok, transactionId: "x".repeat(81) })).toEqual({ error: "bad_transaction_id" });
    expect(readManualInput(null)).toEqual({ error: "bad_request" });
    expect(readManualInput({ ...ok, clientKey: "" })).toEqual({ error: "bad_request" });
  });
});

describe("readRefundAction", () => {
  it("reads each action and its fields", () => {
    expect(readRefundAction({ action: "markRefunded", id: "r1", transactionId: "T1" })).toEqual({ value: { action: "markRefunded", id: "r1", transactionId: "T1" } });
    expect(readRefundAction({ action: "claimable", id: "r1", value: "claimable" })).toEqual({ value: { action: "claimable", id: "r1", value: "claimable" } });
    expect(readRefundAction({ action: "remove", ids: ["a", "b", "a"] })).toEqual({ value: { action: "remove", ids: ["a", "b"] } });
  });
  it("refuses anything else, including too many ids", () => {
    expect(readRefundAction({ action: "zap" })).toEqual({ error: "bad_request" });
    expect(readRefundAction({ action: "markRefunded", id: "", transactionId: "T" })).toEqual({ error: "bad_request" });
    expect(readRefundAction({ action: "remove", ids: [] })).toEqual({ error: "bad_request" });
    expect(readRefundAction({ action: "remove", ids: Array.from({ length: 501 }, (_, i) => `r${i}`) })).toEqual({ error: "bad_request" });
    expect(readRefundAction({ action: "remove", ids: [5] })).toEqual({ error: "bad_request" });
  });
});
