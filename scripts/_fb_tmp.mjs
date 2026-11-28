import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
console.log(await db.orderLine.findMany({ where: { shop: "urban-deco-dev.myshopify.com", order: { name: "#1036" } }, select: { lineStatusId: true, completedDate: true } }).catch(async () => {
  const o = await db.order.findFirst({ where: { shop: "urban-deco-dev.myshopify.com", name: "#1036" } });
  return db.orderLine.findMany({ where: { orderId: o.orderId }, select: { lineStatusId: true, completedDate: true } });
}));
await db.$disconnect();
