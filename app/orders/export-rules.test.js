import { describe, expect, it } from "vitest";
import { EXPORT_HEADERS, buildCsv, csvCell, exportRow } from "./export-rules.js";

const line = (over = {}) => ({
  lineId: "gid://shopify/LineItem/2675499",
  orderId: "gid://shopify/Order/1",
  title: "Seaford Narrow Open Shelving Unit",
  sku: "80037",
  vendor: "Actona",
  variantTitle: "8 x Chairs",
  variantId: "gid://shopify/ProductVariant/600",
  quantity: 2,
  priceMinor: 11999,
  discountMinor: 0,
  lineStatusId: 2,
  expectedDate: "2026-12-24",
  orderCreatedAt: new Date("2026-11-19T23:30:00Z"),
  ...over,
});
const ctx = { orderName: "#1038", statusLabel: "Payment Process", cost: { costMinor: 4400, range: "Actona Seaford" } };

describe("csvCell", () => {
  it("quotes cells with commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("leaves blanks empty and writes numbers as they are", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(7)).toBe("7");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("---")).toBe("---");
  });
  it("stops a spreadsheet running a cell as a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-cmd")).toBe("'-cmd");
  });
});

describe("buildCsv", () => {
  it("writes the header and rows with CRLF line ends", () => {
    expect(buildCsv(["A", "B"], [["1", "x,y"], ["2", ""]])).toBe('A,B\r\n1,"x,y"\r\n2,\r\n');
  });
});

describe("export 2 (supplier chase-up sheet)", () => {
  it("has the legacy columns in order", () => {
    expect(EXPORT_HEADERS[2]).toEqual(["iOrderDetailId", "Order Date", "Order Number", "Product Name", "Product Code", "Size Options", "Color", "Qty", "Order Status", "Expected Date", "New Expected Date", "SO No."]);
  });
  it("maps a line, leaving the two hand-filled columns blank", () => {
    expect(exportRow(2, line(), ctx)).toEqual(["2675499", "19/11/2026", "#1038", "Seaford Narrow Open Shelving Unit", "80037", "8 x Chairs", "---", 2, "Payment Process", "24/12/2026", "", ""]);
  });
  it("uses --- for a line with no variant and blank for no date or status", () => {
    const row = exportRow(2, line({ variantTitle: null, sku: null, expectedDate: null, lineStatusId: null }), { ...ctx, statusLabel: null });
    expect(row.slice(4, 7)).toEqual(["", "---", "---"]);
    expect(row.slice(8, 10)).toEqual(["", ""]);
  });
  it("shows the order date in UK time, not UTC", () => {
    expect(exportRow(2, line({ orderCreatedAt: new Date("2026-06-30T23:30:00Z") }), ctx)[1]).toBe("01/07/2026");
  });
});

describe("export 3 (per-brand ordering sheet)", () => {
  it("has the legacy columns in order", () => {
    expect(EXPORT_HEADERS[3]).toEqual(["Order Date", "Order Number", "Brand Name", "Range Name", "Product Name", "Product Code", "Size Options", "Product Cost", "Variant & Access COST", "Unit Sale", "Qty", "Total Sale", "Final Sale Price", "PO Number", "Order Status", "Expected Date"]);
  });
  it("maps a line with cost, range and sale amounts in pounds", () => {
    expect(exportRow(3, line(), ctx)).toEqual(["19/11/2026", "#1038", "Actona", "Actona Seaford", "Seaford Narrow Open Shelving Unit", "80037", "8 x Chairs", "44", "44.00", "119.99", 2, "239.98", "119.99", "", "Payment Process", "24/12/2026"]);
  });
  it("takes the line discount off the final sale price per unit", () => {
    expect(exportRow(3, line({ discountMinor: 2400 }), ctx)[12]).toBe("107.99");
  });
  it("leaves cost and range blank when Shopify has none, and names a missing brand Unmapped", () => {
    const row = exportRow(3, line({ vendor: "" }), { ...ctx, cost: null });
    expect(row.slice(2, 4)).toEqual(["Unmapped", ""]);
    expect(row.slice(7, 9)).toEqual(["", ""]);
    const noCost = exportRow(3, line(), { ...ctx, cost: { costMinor: null, range: "R" } });
    expect(noCost.slice(3, 4)).toEqual(["R"]);
    expect(noCost.slice(7, 9)).toEqual(["", ""]);
  });
});
