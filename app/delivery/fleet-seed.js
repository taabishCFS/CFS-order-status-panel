// The drivers and vans of the old system (driver dropdown and Van list, screenshots sent by staff 2026-11-26), as starting data for
// Van Management and Driver Management. Which driver drives which van, registrations and phone numbers were not in the screenshots:
// staff add those on the pages.

export const OLD_DRIVERS = ["barry", "farook", "navdeep", "nazir", "praveen", "Rajwant", "viman", "yusuf", "zeeshan"];

/** Vans in the old list's order. Kinetic Logistics and Panther are added inactive: their pages and partners are not used now. */
export const OLD_VANS = [
  "Van 1", "Van2", "Van3", "Van4", "Van5", "Van6", "Van7", "Fitting Van", "Graham Van", "Leicester", "Humz Van", "Van9", "Devon CFS", "Van12", "SGK",
  "Graham Scotland", "Graham Devon", "Kinetic Logistics", "Panther", "CFS Van",
];
export const INACTIVE_VANS = ["Kinetic Logistics", "Panther"];

/**
 * Adds the old drivers and vans that are missing (by name, ignoring case). Never changes or removes what is there.
 * Returns { driversAdded, vansAdded, driversKept, vansKept } (names).
 */
export async function loadOldFleet(db, shop) {
  const haveDrivers = new Set((await db.driver.findMany({ where: { shop }, select: { name: true } })).map((d) => d.name.trim().toLowerCase()));
  const haveVans = new Set((await db.van.findMany({ where: { shop }, select: { name: true } })).map((v) => v.name.trim().toLowerCase()));
  const driversAdded = OLD_DRIVERS.filter((n) => !haveDrivers.has(n.toLowerCase()));
  const vansAdded = OLD_VANS.filter((n) => !haveVans.has(n.toLowerCase()));
  for (const name of driversAdded) await db.driver.create({ data: { shop, name } });
  for (const name of vansAdded) await db.van.create({ data: { shop, name, active: !INACTIVE_VANS.includes(name) } });
  return {
    driversAdded, vansAdded,
    driversKept: OLD_DRIVERS.filter((n) => !driversAdded.includes(n)),
    vansKept: OLD_VANS.filter((n) => !vansAdded.includes(n)),
  };
}
