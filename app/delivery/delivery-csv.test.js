import { describe, expect, it } from "vitest";
import { onlyLines } from "./booked-delivery.server.js";
import { bookedCsv, bookedFileName, dayTitle, driverSheetCsv, pickListCsv, runTitle, sheetFileName } from "./delivery-csv.js";

const row = (n, over = {}) => ({ lineId: `L${n}`, orderId: `O${n}`, orderName: `UD${n}`, orderDate: "2026-11-07T10:00:00.000Z", product: `Table, "big" ${n}`, code: `C${n}`, size: "", quantity: 1, box: null, delivery: n === 2 ? "declined" : "confirmed", lineStatusId: 4, amPm: n > 2 ? "PM" : "AM", drop: n, deliveryType: "Free Door Delivery", postcode: "E1 1AA", amountMinor: 1000 * n, ...over });
const run = { key: "k", date: "2026-11-25", vanId: "v1", vanName: "Van 1", driverName: "Driver1", rows: [row(1), row(2), row(3)], totalMinor: 6000, currency: "GBP" };

describe("delivery CSV files", () => {
  it("titles a run and names the page export", () => {
    expect(dayTitle("2026-11-25")).toBe("25/11/2026 (Wednesday)");
    expect(runTitle(run)).toBe("25/11/2026 (Wednesday) - Van 1 - Driver1");
    expect(bookedFileName([run], "2026-11-25", "2026-11-25")).toBe("25-11-2026_Van1_DropWise.csv");
    expect(bookedFileName([run, run], "2026-11-25", "2026-11-25")).toBe("25-11-2026_DropWise.csv");
    expect(bookedFileName([run, run], "2026-11-25", "2026-11-27")).toBe("25-11-2026_to_27-11-2026_DropWise.csv");
    expect(sheetFileName(run, "picklist")).toBe("Van 1-2026-11-25 Pick List.csv");
  });
  it("writes the page columns, quotes text and ends each run with its total", () => {
    const lines = bookedCsv([run]).replace("\uFEFF", "").split("\r\n");
    expect(lines[0]).toBe("25/11/2026 (Wednesday) - Van 1 - Driver1");
    expect(lines[1]).toBe("Date,Order No.,Item,Product Code,Qty.,Box,Confirm?,Status,Time,Drop,Delivery Type,Post Code,Total Amount");
    expect(lines[2]).toBe('07/11/2026,UD1,"Table, ""big"" 1",C1,1,,Confirmed,In Stock,AM,1,Free Door Delivery,E1 1AA,10.00');
    expect(lines[3]).toContain("Not Confirmed");
    expect(lines[5]).toBe(",,,,,,,,,,,Total,60.00");
  });
  it("Driver Sheet goes in drop order, Pick List from the last drop back", () => {
    const driver = driverSheetCsv(run).replace("\uFEFF", "").split("\r\n");
    const pick = pickListCsv(run).replace("\uFEFF", "").split("\r\n");
    expect(driver[0].endsWith("Delivery Type")).toBe(true);
    expect(pick[0].endsWith("Order Total")).toBe(true);
    expect(driver[1]).toContain("UD1");
    expect(pick[1]).toContain("UD3");
    expect(pick[1].endsWith("30.00")).toBe(true);
  });
  it("keeps only the ticked lines and works the totals out again", () => {
    const r = onlyLines([run, { ...run, key: "k2", rows: [row(9)] }], ["L1", "L3"]);
    expect(r).toHaveLength(1);
    expect(r[0].rows.map((x) => x.lineId)).toEqual(["L1", "L3"]);
    expect(r[0].totalMinor).toBe(4000);
  });
});
