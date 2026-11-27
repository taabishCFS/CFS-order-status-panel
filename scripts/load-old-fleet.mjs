// Adds the old system's drivers and vans that are missing for a shop. Safe to run again: existing rows are never changed.
// Run: node --env-file=.env scripts/load-old-fleet.mjs <shop>.myshopify.com
import { PrismaClient } from "@prisma/client";
import { loadOldFleet } from "../app/delivery/fleet-seed.js";

const shop = process.argv[2];
if (!shop || !shop.endsWith(".myshopify.com")) {
  console.error("Give the shop, for example: node --env-file=.env scripts/load-old-fleet.mjs your-store.myshopify.com");
  process.exit(1);
}
const db = new PrismaClient();
try {
  const r = await loadOldFleet(db, shop);
  console.log(`Drivers added (${r.driversAdded.length}): ${r.driversAdded.join(", ") || "none"}`);
  console.log(`Vans added (${r.vansAdded.length}): ${r.vansAdded.join(", ") || "none"}`);
  if (r.driversKept.length || r.vansKept.length) console.log(`Already there, left as they are: ${[...r.driversKept, ...r.vansKept].join(", ")}`);
} finally {
  await db.$disconnect();
}
