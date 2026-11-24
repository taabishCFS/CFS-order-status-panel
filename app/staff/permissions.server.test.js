import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, can, isRestricted, listStaff, permissionsFor, recordStaff, setStaffPermissions } from "./permissions.server.js";

// A small in-memory stand-in for the StaffMember table.
function memoryDb(rows = []) {
  const state = { rows: rows.map((r) => ({ lastSeenAt: new Date("2026-11-20T10:00:00Z"), ...r })) };
  const matchKeys = (r, where) => !where.keys?.has || (r.keys ?? []).includes(where.keys.has);
  return {
    state,
    staffMember: {
      count: async ({ where }) => state.rows.filter((r) => r.shop === where.shop && matchKeys(r, where)).length,
      findFirst: async ({ where }) => state.rows.find((r) => r.shop === where.shop && r.staffId === where.staffId) ?? null,
      findMany: async ({ where }) => state.rows.filter((r) => r.shop === where.shop),
      upsert: async ({ where, create, update }) => {
        const found = state.rows.find((r) => r.shop === where.shop_staffId.shop && r.staffId === where.shop_staffId.staffId);
        if (found) return Object.assign(found, update);
        const row = { keys: [], ...create };
        state.rows.push(row);
        return row;
      },
      update: async ({ where, data }) => Object.assign(state.rows.find((r) => r.shop === where.shop_staffId.shop && r.staffId === where.shop_staffId.staffId), data),
    },
  };
}
const sam = { id: "1", name: "Sam" };
const kim = { id: "2", name: "Kim" };
const row = (staff, keys = []) => ({ shop: "s", staffId: staff.id, name: staff.name, keys });

describe("before anyone is a manager", () => {
  it("nobody is restricted: every verified staff member may do everything, and an unverified caller nothing", async () => {
    const db = memoryDb([row(sam), row(kim)]);
    expect(await isRestricted(db, "s")).toBe(false);
    expect(await permissionsFor(db, "s", kim)).toEqual({ restricted: false, keys: PERMISSION_KEYS, canManage: true });
    expect(await permissionsFor(db, "s", null)).toEqual({ restricted: false, keys: [], canManage: false });
    expect(await can(db, "s", kim, "refunds")).toBe(true);
  });
});

describe("once someone manages permissions", () => {
  const configured = () => memoryDb([row(sam, ["manage_permissions", "refunds"]), row(kim, ["delivery_notes"])]);
  it("each person has only the ticked actions", async () => {
    const db = configured();
    expect(await isRestricted(db, "s")).toBe(true);
    expect(await permissionsFor(db, "s", sam)).toEqual({ restricted: true, keys: ["manage_permissions", "refunds"], canManage: true });
    expect(await can(db, "s", kim, "delivery_notes")).toBe(true);
    expect(await can(db, "s", kim, "refunds")).toBe(false);
    expect(await can(db, "s", { id: "99", name: "New" }, "refunds")).toBe(false);
  });
  it("ignores keys it does not know", async () => {
    const db = memoryDb([row(sam, ["manage_permissions", "made_up"])]);
    expect((await permissionsFor(db, "s", sam)).keys).toEqual(["manage_permissions"]);
  });
  it("only a manager can change permissions", async () => {
    const db = configured();
    expect(await setStaffPermissions(db, "s", kim, "1", [])).toEqual({ ok: false, error: "forbidden" });
    expect(await setStaffPermissions(db, "s", sam, "2", ["refunds", "refunds", "delivery_charges"])).toEqual({ ok: true });
    expect(db.state.rows[1].keys).toEqual(["refunds", "delivery_charges"]);
    expect(db.state.rows[1].updatedBy).toBe("Sam");
  });
  it("refuses unknown keys, bad input and unknown staff", async () => {
    const db = configured();
    expect(await setStaffPermissions(db, "s", sam, "2", ["nope"])).toEqual({ ok: false, error: "bad_request" });
    expect(await setStaffPermissions(db, "s", sam, "2", "refunds")).toEqual({ ok: false, error: "bad_request" });
    expect(await setStaffPermissions(db, "s", sam, "", [])).toEqual({ ok: false, error: "bad_request" });
    expect(await setStaffPermissions(db, "s", sam, "77", [])).toEqual({ ok: false, error: "not_found" });
  });
  it("never leaves nobody able to manage", async () => {
    const db = configured();
    expect(await setStaffPermissions(db, "s", sam, "1", ["refunds"])).toEqual({ ok: false, error: "last_manager" });
    expect(await setStaffPermissions(db, "s", sam, "2", ["manage_permissions"])).toEqual({ ok: true });
    expect(await setStaffPermissions(db, "s", sam, "1", ["refunds"])).toEqual({ ok: true });
  });
});

describe("the first manager", () => {
  it("while nobody is restricted anyone can name a manager, and the rules then switch on", async () => {
    const db = memoryDb([row(sam), row(kim)]);
    expect(await setStaffPermissions(db, "s", kim, "1", ["manage_permissions", "refunds", "delivery_charges", "delivery_notes"])).toEqual({ ok: true });
    expect(await isRestricted(db, "s")).toBe(true);
    expect(await can(db, "s", kim, "refunds")).toBe(false);
    expect(await can(db, "s", sam, "refunds")).toBe(true);
  });
});

describe("recordStaff and listStaff", () => {
  it("adds a new person with no permissions, refreshes a known one's name, and skips an unnamed caller", async () => {
    const db = memoryDb();
    await recordStaff(db, "s", sam);
    await recordStaff(db, "s", { id: "1", name: "Samuel" });
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0]).toMatchObject({ staffId: "1", name: "Samuel", keys: [] });
    expect(await recordStaff(db, "s", null)).toBeNull();
    expect(await recordStaff(db, "s", { id: "3", name: "" })).toBeNull();
  });
  it("lists people with their permissions and last seen time", async () => {
    const db = memoryDb([row(sam, ["refunds", "junk"])]);
    expect(await listStaff(db, "s")).toEqual([{ staffId: "1", name: "Sam", keys: ["refunds"], lastSeenAt: "2026-11-20T10:00:00.000Z" }]);
  });
});
