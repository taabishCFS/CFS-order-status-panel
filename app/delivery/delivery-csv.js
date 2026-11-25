// CSV files for the Delivery Booked page: the page export (every column, run by run), and each run's Pick List and Driver Sheet.
// Pure functions, no database access. Columns follow the old system's files.
import statuses from "../../extensions/cfs-order-status/src/statuses.json";

const label = new Map(statuses.map((s) => [s.id, s.label]));
const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (cells) => cells.map(cell).join(",");
const dmy = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const money = (minor) => ((minor ?? 0) / 100).toFixed(2);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BOM = "﻿";

/** "25/11/2026 (Wednesday)" for a YYYY-MM-DD date. */
export function dayTitle(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${dmy(date)} (${DAYS[d.getUTCDay()]})`;
}
/** The heading of a run: "25/11/2026 (Wednesday) - Van 1 - Driver1". */
export const runTitle = (run) => `${dayTitle(run.date)} - ${run.vanName}${run.driverName ? ` - ${run.driverName}` : ""}`;

const safe = (text) => String(text).replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "");

/** File name for the page export: one run, one day, or a date range. */
export function bookedFileName(runs, from, to) {
  if (runs.length === 1) return `${dmy(runs[0].date).replace(/\//g, "-")}_${safe(runs[0].vanName)}_DropWise.csv`;
  const f = dmy(from).replace(/\//g, "-");
  const t = dmy(to).replace(/\//g, "-");
  return f === t ? `${f}_DropWise.csv` : `${f}_to_${t}_DropWise.csv`;
}

const confirmText = (row) => (row.delivery === "confirmed" ? "Confirmed" : "Not Confirmed");

/** The page export: for each run a title line, the column heads, its rows and a total. */
export function bookedCsv(runs) {
  const out = [];
  for (const run of runs) {
    out.push(line([runTitle(run)]));
    out.push(line(["Date", "Order No.", "Item", "Product Code", "Qty.", "Box", "Confirm?", "Status", "Time", "Drop", "Delivery Type", "Post Code", "Total Amount"]));
    for (const r of run.rows) {
      out.push(line([dmy(r.orderDate), r.orderName, r.product, r.code, r.quantity, r.box ?? "", confirmText(r), label.get(r.lineStatusId) ?? "", r.amPm, r.drop ?? "", r.deliveryType, r.postcode, money(r.amountMinor)]));
    }
    out.push(line(["", "", "", "", "", "", "", "", "", "", "", "Total", money(run.totalMinor)]));
    out.push("");
  }
  return BOM + out.join("\r\n");
}

/** Driver Sheet: the run in drop order, with the delivery type. */
export function driverSheetCsv(run) {
  const rows = [...run.rows].sort((a, b) => (a.drop ?? 999) - (b.drop ?? 999) || a.orderName.localeCompare(b.orderName));
  return BOM + [
    line(["Date", "Order No.", "Items", "Code", "Size", "Color", "Qty", "Box", "Van", "Time Slot", "Drop", "Delivery Confirmed?", "Delivery Type"]),
    ...rows.map((r) => line([dmy(run.date), r.orderName, r.product, r.code, r.size ?? "", "", r.quantity, r.box ?? 0, run.vanName, r.amPm, r.drop ?? "", confirmText(r), r.deliveryType])),
  ].join("\r\n");
}

/** Pick List: the run loaded last drop first, with the order total. */
export function pickListCsv(run) {
  const rows = [...run.rows].sort((a, b) => (b.drop ?? 0) - (a.drop ?? 0) || a.orderName.localeCompare(b.orderName));
  return BOM + [
    line(["Date", "Order No.", "Items", "Code", "Size", "Color", "Qty", "Box", "Van", "Time Slot", "Drop", "Delivery Confirmed?", "Order Total"]),
    ...rows.map((r) => line([dmy(run.date), r.orderName, r.product, r.code, r.size ?? "", "", r.quantity, r.box ?? 0, run.vanName, r.amPm, r.drop ?? "", confirmText(r), money(r.amountMinor)])),
  ].join("\r\n");
}

/** "Van 1-2026-11-25 Pick List.csv" style names for a run's sheets. */
export const sheetFileName = (run, kind) => `${run.vanName}-${run.date} ${kind === "picklist" ? "Pick List" : "Driver Sheet"}.csv`;
