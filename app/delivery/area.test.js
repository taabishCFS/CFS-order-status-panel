import { beforeEach, describe, expect, it } from "vitest";
import { activeAreas, cleanPostcodes, postcodeInArea, deleteAreas, listAreas, readAreaInput, saveArea, setAreasActive } from "./area.server.js";

const SHOP = "s.myshopify.com";
function makeDb() {
  let n = 0;
  const rows = [];
  const match = (r, w = {}) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "in" in v ? v.in.includes(r[k]) : r[k] === v));
  return {
    rows,
    area: {
      findMany: async ({ where } = {}) => rows.filter((r) => match(r, where)).map((r) => ({ ...r })),
      create: async ({ data }) => { rows.push({ id: `a${++n}`, ...data }); },
      update: async ({ where, data }) => { Object.assign(rows.find((r) => r.id === where.id), data); },
      updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
      deleteMany: async ({ where }) => { const keep = rows.filter((r) => !match(r, where)); const count = rows.length - keep.length; rows.splice(0, rows.length, ...keep); return { count }; },
    },
  };
}
let db;
beforeEach(() => { db = makeDb(); });

describe("postcodes", () => {
  it("are upper-cased, trimmed and de-duplicated", () => {
    expect(cleanPostcodes(" ne, DH ,,sr, NE")).toBe("NE, DH, SR");
    expect(cleanPostcodes(undefined)).toBe("");
  });
});
describe("matching a postcode", () => {
  it("ignores spaces and case and matches the beginning only", () => {
    expect(postcodeInArea("ne1 4ab", "NE, DH")).toBe(true);
    expect(postcodeInArea("N E1 4AB", "ne")).toBe(true);
    expect(postcodeInArea("DL1 4AB", "NE, DH")).toBe(false);
    expect(postcodeInArea("ANE1", "NE")).toBe(false);
    expect(postcodeInArea("", "NE")).toBe(false);
    expect(postcodeInArea("NE1", "")).toBe(false);
  });
  it("lists only active areas for the filter", async () => {
    await saveArea(db, SHOP, { op: "add", name: "On", postcodes: "A", active: true });
    await saveArea(db, SHOP, { op: "add", name: "Off", postcodes: "B", active: false });
    expect(await activeAreas(db, SHOP)).toEqual([{ id: "a1", name: "On" }]);
  });
});
describe("reading a request", () => {
  it("needs a name, and ticked rows for status and delete", () => {
    expect(readAreaInput({ op: "add", name: " North ", postcodes: "ne,dh" })).toEqual({ value: { op: "add", name: "North", postcodes: "NE, DH", active: true } });
    expect(readAreaInput({ op: "add", name: " " })).toEqual({ error: "no_name" });
    expect(readAreaInput({ op: "update", name: "A" })).toEqual({ error: "bad_request" });
    expect(readAreaInput({ op: "status", ids: [], active: true })).toEqual({ error: "nothing_selected" });
    expect(readAreaInput({ op: "status", ids: ["a"] })).toEqual({ error: "bad_request" });
    expect(readAreaInput({ op: "delete", ids: ["a"] })).toEqual({ value: { op: "delete", ids: ["a"] } });
  });
});
describe("areas", () => {
  it("adds with counting IDs and refuses a duplicate name", async () => {
    expect(await saveArea(db, SHOP, { op: "add", name: "North", postcodes: "NE", active: true })).toEqual({ ok: true });
    expect(await saveArea(db, SHOP, { op: "add", name: " north ", postcodes: "", active: true })).toEqual({ ok: false, code: "duplicate" });
    await saveArea(db, SHOP, { op: "add", name: "South", postcodes: "", active: false });
    const list = await listAreas(db, SHOP);
    expect(list.rows.map((r) => [r.number, r.name, r.active])).toEqual([[1, "North", true], [2, "South", false]]);
  });
  it("updates, switches active and deletes", async () => {
    await saveArea(db, SHOP, { op: "add", name: "North", postcodes: "NE", active: true });
    await saveArea(db, SHOP, { op: "add", name: "South", postcodes: "", active: true });
    expect(await saveArea(db, SHOP, { op: "update", id: "a1", name: "South", postcodes: "", active: true })).toEqual({ ok: false, code: "duplicate" });
    expect(await saveArea(db, SHOP, { op: "update", id: "zz", name: "X", postcodes: "", active: true })).toEqual({ ok: false, code: "not_found" });
    expect(await saveArea(db, SHOP, { op: "update", id: "a1", name: "Northern", postcodes: "NE, DH", active: true })).toEqual({ ok: true });
    expect(await setAreasActive(db, SHOP, ["a1", "a2"], false)).toEqual({ ok: true, changed: 2 });
    expect((await listAreas(db, SHOP)).rows.map((r) => [r.name, r.postcodes, r.active])).toEqual([["Northern", "NE, DH", false], ["South", "", false]]);
    expect(await deleteAreas(db, SHOP, ["a1"])).toEqual({ ok: true, deleted: 1 });
  });
});
