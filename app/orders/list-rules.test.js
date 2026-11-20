import { describe, expect, it } from "vitest";
import { HIDDEN_LINE_STATUSES, buildLineWhere, buildOrderWhere, parseListParams, payType, rowTone, searchTerms } from "./list-rules.js";

const parse = (qs, kind = "orders") => parseListParams(new URLSearchParams(qs), kind);
const params = (over = {}) => ({ page: 1, all: false, brand: null, from: null, to: null, q: "", statusId: null, takenBy: null, archived: false, insurance: false, ...over });

describe("parseListParams", () => {
  it("clamps a bad page to 1", () => {
    for (const bad of ["0", "-3", "abc", "", "1.5"]) expect(parse(`page=${bad}`).page).toBe(1);
    expect(parse("page=7").page).toBe(7);
  });

  it("drops dates that are not YYYY-MM-DD or not real", () => {
    expect(parse("from=2026-11-01&to=2026-11-30")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(parse("from=01/11/2026&to=2026-13-45")).toMatchObject({ from: null, to: null });
  });

  it("trims and cuts the search to 120 characters", () => {
    expect(parse(`q=${encodeURIComponent("  a b  ")}`).q).toBe("a b");
    expect(parse(`q=${"x".repeat(500)}`).q).toHaveLength(120);
  });

  it("reads a numeric status and drops anything else", () => {
    expect(parse("statusId=3").statusId).toBe(3);
    expect(parse("statusId=abc").statusId).toBeNull();
  });

  it("reads the flags", () => {
    expect(parse("all=1&archived=1&insurance=1")).toMatchObject({ all: true, archived: true, insurance: true });
    expect(parse("")).toMatchObject({ all: false, archived: false, insurance: false });
  });
});

describe("searchTerms", () => {
  it("keeps at most 6 words", () => {
    expect(searchTerms("a b c d e f g h")).toHaveLength(6);
  });
  it("passes wildcard characters through as plain text", () => {
    expect(searchTerms("100% a_b")).toEqual(["100%", "a_b"]);
  });
});

describe("payType", () => {
  const t = (financialStatus, extra = {}) => payType({ financialStatus, cancelledAt: null, orderStatusId: null, ...extra });
  it("maps Shopify financial statuses", () => {
    expect(t("PAID")).toBe("paid");
    expect(t("PARTIALLY_PAID")).toBe("partial");
    expect(t("PARTIALLY_REFUNDED")).toBe("partial");
    expect(t("PENDING")).toBe("awaiting");
    expect(t("AUTHORIZED")).toBe("awaiting");
    expect(t(null)).toBe("awaiting");
  });
  it("calls voided, cancelled and failed-status orders failed", () => {
    expect(t("VOIDED")).toBe("failed");
    expect(t("PAID", { cancelledAt: new Date() })).toBe("failed");
    for (const orderStatusId of [7, 32, 50]) expect(t("PAID", { orderStatusId })).toBe("failed");
  });
});

describe("rowTone", () => {
  it("is red for a partially paid order and blue for a replacement", () => {
    expect(rowTone({ name: "#1035", financialStatus: "PARTIALLY_PAID" })).toBe("red");
    expect(rowTone({ name: "#R1035", financialStatus: "PAID" })).toBe("blue");
    expect(rowTone({ name: "RUD2924", financialStatus: "PAID" })).toBe("blue");
    expect(rowTone({ name: "#1035", financialStatus: "PAID" })).toBeNull();
  });
});

describe("buildOrderWhere", () => {
  const and = (w) => w.AND;
  it("is always scoped to the shop and hides archived orders by default", () => {
    const w = buildOrderWhere("s", params());
    expect(w.shop).toBe("s");
    expect(and(w)).toContainEqual({ archivedAt: null });
    expect(and(buildOrderWhere("s", params({ archived: true })))).toContainEqual({ archivedAt: { not: null } });
  });

  it("hides header status 9 unless searching", () => {
    const hidden = { OR: [{ orderStatusId: null }, { orderStatusId: { notIn: [9] } }] };
    expect(and(buildOrderWhere("s", params()))).toContainEqual(hidden);
    expect(and(buildOrderWhere("s", params({ q: "smith" })))).not.toContainEqual(hidden);
  });

  it("runs the date range from the start of From to the end of To", () => {
    const w = buildOrderWhere("s", params({ from: "2026-11-01", to: "2026-11-30" }));
    expect(and(w)).toContainEqual({ createdAt: { gte: new Date("2026-11-01T00:00:00.000Z"), lte: new Date("2026-11-30T23:59:59.999Z") } });
  });

  it("requires every search word to match one of the five fields", () => {
    const w = buildOrderWhere("s", params({ q: "alex le1" }));
    const ors = and(w).filter((c) => c.OR && c.OR[0]?.name);
    expect(ors).toHaveLength(2);
    expect(ors[0].OR.map((c) => Object.keys(c)[0])).toEqual(["name", "customerName", "email", "phone", "postcode"]);
    expect(ors[0].OR[0].name).toEqual({ contains: "alex", mode: "insensitive" });
  });

  it("filters by brand, line status and taker", () => {
    const w = buildOrderWhere("s", params({ brand: "Actona", statusId: 3, takenBy: "ABEER" }));
    expect(and(w)).toContainEqual({ brands: { has: "Actona" } });
    expect(and(w)).toContainEqual({ lineStatusIds: { has: 3 } });
    expect(and(w)).toContainEqual({ orderTakenBy: "ABEER" });
  });
});

describe("buildLineWhere", () => {
  const and = (w) => w.AND;
  it("hides the finished statuses unless a status is chosen, then shows exactly it", () => {
    expect(HIDDEN_LINE_STATUSES).toEqual([6, 7, 9, 32, 58, 66, 50]);
    expect(and(buildLineWhere("s", params()))).toContainEqual({ OR: [{ lineStatusId: null }, { lineStatusId: { notIn: HIDDEN_LINE_STATUSES } }] });
    expect(and(buildLineWhere("s", params({ statusId: 6 })))).toContainEqual({ lineStatusId: 6 });
  });

  it("maps the Unmapped brand to a blank vendor", () => {
    expect(and(buildLineWhere("s", params({ brand: "Unmapped" })))).toContainEqual({ OR: [{ vendor: null }, { vendor: "" }] });
    expect(and(buildLineWhere("s", params({ brand: "Actona" })))).toContainEqual({ vendor: "Actona" });
  });

  it("filters Insurance by a case-insensitive title match, uses the order date, and hides archived", () => {
    const w = buildLineWhere("s", params({ insurance: true, from: "2026-11-01" }));
    expect(w.shop).toBe("s");
    expect(and(w)).toContainEqual({ title: { contains: "insurance", mode: "insensitive" } });
    expect(and(w)).toContainEqual({ orderCreatedAt: { gte: new Date("2026-11-01T00:00:00.000Z") } });
    expect(and(w)).toContainEqual({ orderArchived: false });
  });
});
