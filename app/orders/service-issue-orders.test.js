import { describe, expect, it } from "vitest";
import { daysTaken, listServiceOrders, parseServiceOrderParams, serviceOrdersCsv } from "./service-issue-orders.server.js";
import { readStatusState } from "./status-state.js";

const O = (n) => `gid://shopify/Order/${n}`;
const NOW = new Date("2026-11-28T12:00:00Z");

function fakeDb(orders, lines) {
  const matchOrder = (o, where) => where.AND.every((c) => {
    if (c.shop) return true;
    if (c.OR) return c.OR.some((x) => (x.orderStatusId !== undefined && o.orderStatusId === x.orderStatusId)
      || (x.lineStatusIds && o.lineStatusIds.includes(x.lineStatusIds.has))
      || (x.name && o.name.toLowerCase().startsWith(x.name.startsWith.toLowerCase())));
    if (c.orderTakenBy?.equals) return (o.orderTakenBy ?? "").toLowerCase() === c.orderTakenBy.equals.toLowerCase();
    if (c.orderTakenBy?.not === null) return o.orderTakenBy !== null;
    if (c.name?.contains) return o.name.toLowerCase().includes(c.name.contains.toLowerCase());
    return true;
  });
  return {
    order: {
      findMany: async ({ where, distinct }) => {
        const found = orders.filter((o) => matchOrder(o, where));
        return distinct ? [...new Map(found.map((o) => [o.orderTakenBy, o])).values()] : found;
      },
    },
    orderLine: {
      findMany: async ({ where }) => lines.filter((l) => where.orderId.in.includes(l.orderId)
        && (!where.expectedDate || (l.expectedDate && l.expectedDate >= where.expectedDate.gte && l.expectedDate <= where.expectedDate.lte))),
    },
  };
}

const orders = [
  { orderId: O(1), name: "#1040", createdAt: new Date("2026-11-01T10:00:00Z"), orderTakenBy: "Vinod", orderStatusId: 15, lineStatusIds: [6] },
  { orderId: O(2), name: "#R1041", createdAt: new Date("2026-11-20T10:00:00Z"), orderTakenBy: "shree", orderStatusId: 3, lineStatusIds: [3] },
  { orderId: O(3), name: "#1042", createdAt: new Date("2026-11-21T10:00:00Z"), orderTakenBy: null, orderStatusId: 3, lineStatusIds: [15, 4] },
  { orderId: O(4), name: "#1043", createdAt: new Date("2026-11-22T10:00:00Z"), orderTakenBy: "Vinod", orderStatusId: 3, lineStatusIds: [4] },
];
const line = (id, orderId, extra) => ({ lineId: id, orderId, title: `Item ${id}`, sku: `SKU${id}`, quantity: 1, vendor: "Acme", lineStatusId: 4, expectedDate: null, statusAt: null, statusBy: null, serviceRemarks: null, ...extra });
const lines = [
  line("A", O(1), { lineStatusId: 6, statusAt: new Date("2026-11-11T09:00:00Z"), statusBy: "Ali", expectedDate: "2026-11-05" }),
  line("B", O(2), { lineStatusId: 3, expectedDate: "2026-12-01" }),
  line("C", O(3), { lineStatusId: 15, serviceRemarks: "Leg loose" }),
  line("D", O(3), { lineStatusId: 7 }),
  line("E", O(4)),
];

describe("Service Issue Orders", () => {
  it("keeps when and by whom a line got its status, and the Service Issue remarks", () => {
    const r = readStatusState(JSON.stringify({ lines: { L: { statusId: 15, at: "2026-11-20T10:00:00Z", by: { name: "Ali" }, extras: { serviceRemarks: "Scratched" } } } }));
    expect(r.lines.L).toMatchObject({ statusAt: "2026-11-20T10:00:00Z", statusBy: "Ali", serviceRemarks: "Scratched" });
  });

  it("lists every item of Service Issue and replacement orders, with the days taken", async () => {
    const r = await listServiceOrders(fakeDb(orders, lines), "s", parseServiceOrderParams(new URLSearchParams("")), NOW);
    expect(r.rows.map((x) => x.lineId)).toEqual(["C", "D", "B", "A"]);
    const byId = Object.fromEntries(r.rows.map((x) => [x.lineId, x]));
    expect(byId.A).toMatchObject({ days: 10, finishedBy: "Ali", orderName: "#1040" });
    expect(byId.B.days).toBe(8); // still going: order day to today
    expect(byId.C.serviceRemarks).toBe("Leg loose");
    expect(byId.D.days).toBe(null); // cancelled, but the day is not known
    expect(r.takers).toEqual(["shree", "Vinod"]);
  });

  it("filters by expected date, taken by and order number", async () => {
    const db = fakeDb(orders, lines);
    const byDate = await listServiceOrders(db, "s", parseServiceOrderParams(new URLSearchParams("from=2026-11-01&to=2026-11-30")), NOW);
    expect(byDate.rows.map((x) => x.lineId)).toEqual(["A"]);
    const byTaker = await listServiceOrders(db, "s", parseServiceOrderParams(new URLSearchParams("takenBy=SHREE")), NOW);
    expect(byTaker.rows.map((x) => x.lineId)).toEqual(["B"]);
    const byOrder = await listServiceOrders(db, "s", parseServiceOrderParams(new URLSearchParams("q=%231042")), NOW);
    expect(byOrder.rows.map((x) => x.lineId)).toEqual(["C", "D"]);
  });

  it("downloads the list", async () => {
    const out = await serviceOrdersCsv(fakeDb(orders, lines), "s", parseServiceOrderParams(new URLSearchParams("q=1040")));
    const [head, row] = out.csv.replace("﻿", "").split("\r\n");
    expect(head).toBe("Order Date,Order No.,Item,Product Code,Qty,Order Taken By,Status,Sup. Expected Date,Completed Date,Completed By,Process Duration (days),Service Remarks");
    expect(row).toBe("01/11/2026,#1040,Item A,SKUA,1,Vinod,Completed,05/11/2026,11/11/2026,Ali,10,");
    expect(daysTaken("2026-11-01T10:00:00Z", "2026-11-01T09:00:00Z")).toBe(0);
  });
});
