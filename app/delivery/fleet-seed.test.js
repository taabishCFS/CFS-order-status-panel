import { describe, expect, it, vi } from "vitest";
import { OLD_DRIVERS, OLD_VANS, loadOldFleet } from "./fleet-seed.js";

describe("loadOldFleet", () => {
  it("adds only the missing drivers and vans, and Kinetic and Panther inactive", async () => {
    const driverCreate = vi.fn(async () => ({}));
    const vanCreate = vi.fn(async () => ({}));
    const db = {
      driver: { findMany: async () => [{ name: "Barry " }], create: driverCreate },
      van: { findMany: async () => [{ name: "van 1" }], create: vanCreate },
    };
    const r = await loadOldFleet(db, "s");
    expect(r.driversKept).toEqual(["barry"]);
    expect(r.vansKept).toEqual(["Van 1"]);
    expect(driverCreate).toHaveBeenCalledTimes(OLD_DRIVERS.length - 1);
    expect(vanCreate).toHaveBeenCalledTimes(OLD_VANS.length - 1);
    const active = Object.fromEntries(vanCreate.mock.calls.map(([a]) => [a.data.name, a.data.active]));
    expect(active).toMatchObject({ Van2: true, "CFS Van": true, Panther: false, "Kinetic Logistics": false });
  });
});
