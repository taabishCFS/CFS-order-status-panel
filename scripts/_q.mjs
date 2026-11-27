import { PrismaClient } from "@prisma/client";
import { BOOKING_CONFIRMATION_RED, NEW_DATE_RED, BOOKING_CONFIRMATION_BODY } from "../app/email/seed/other-templates.js";
const db = new PrismaClient();
const shop = "urban-deco-dev.myshopify.com";
for (const [key, red] of [["delivery.booking_confirmation", BOOKING_CONFIRMATION_RED], ["delivery.new_date", NEW_DATE_RED]]) {
  const t = await db.emailTemplate.findUnique({ where: { shop_key: { shop, key } } });
  console.log(key, "v" + t?.version, "matches red:", t?.body === red);
}
console.log(BOOKING_CONFIRMATION_BODY.includes("#4D403A;color:#fff"));
await db.$disconnect();
