import { describe, expect, it } from "vitest";
import { stockTint, withStock } from "./stock-rules";

describe("stockTint", () => {
  it("is yellow when out of stock with a due date, red without one", () => {
    expect(stockTint({ status: "OUT OF STOCK", dueDate: "2026-12-25" })).toEqual({ tint: "yellow", dueDate: "2026-12-25" });
    expect(stockTint({ status: "OUT OF STOCK", dueDate: null })).toEqual({ tint: "red", dueDate: null });
  });

  it("counts tracked inventory of zero or less as out of stock, whatever the status says", () => {
    expect(stockTint({ status: "IN STOCK", inventory: 0, tracked: true, dueDate: null }).tint).toBe("red");
    expect(stockTint({ status: null, inventory: -2, tracked: true, dueDate: "2026-12-25" }).tint).toBe("yellow");
  });

  it("counts the status as out of stock even when inventory is positive", () => {
    expect(stockTint({ status: "OUT OF STOCK", inventory: 10, tracked: true, dueDate: null }).tint).toBe("red");
  });

  it("is untinted when in stock, when nothing is known, and when zero inventory is not tracked", () => {
    expect(stockTint({ status: "IN STOCK", inventory: 5, tracked: true, dueDate: "2026-12-25" })).toEqual({ tint: null, dueDate: null });
    expect(stockTint({})).toEqual({ tint: null, dueDate: null });
    expect(stockTint({ inventory: 0, tracked: false })).toEqual({ tint: null, dueDate: null });
  });

  it("ignores case and spaces in the status", () => {
    expect(stockTint({ status: " out of stock " }).tint).toBe("red");
  });
});

describe("withStock", () => {
  const V = (n) => `gid://shopify/ProductVariant/${n}`;
  const stock = new Map([
    [V(1), { status: "OUT OF STOCK", dueDate: "2026-12-25", inventory: 0, tracked: true }],
    [V(2), { status: "IN STOCK", dueDate: null, inventory: 9, tracked: true }],
  ]);

  it("adds the tint and due date to each row, and leaves rows with no known variant untinted", () => {
    const rows = [{ lineId: "a", variantId: V(1) }, { lineId: "b", variantId: V(2) }, { lineId: "c", variantId: null }, { lineId: "d", variantId: V(9) }];
    expect(withStock(rows, stock).map((r) => [r.lineId, r.stockTint, r.stockDueDate])).toEqual([["a", "yellow", "2026-12-25"], ["b", null, null], ["c", null, null], ["d", null, null]]);
  });

  it("leaves every row untinted when there is no stock information", () => {
    expect(withStock([{ lineId: "a", variantId: V(1) }], null)[0]).toMatchObject({ stockTint: null, stockDueDate: null });
  });
});
