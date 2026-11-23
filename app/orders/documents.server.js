// Reads an order from Shopify for the printable documents, and keeps the delivery notes log.
import { shapeDocOrder, siteDetails } from "./documents.js";

const MONEY = "shopMoney { amount currencyCode }";
const ADDRESS = "name address1 address2 city province zip country phone";
const QUERY = `#graphql
  query CfsDocumentOrder($id: ID!) {
    order(id: $id) {
      name createdAt tags email phone note
      currentTotalPriceSet { ${MONEY} }
      totalReceivedSet { ${MONEY} }
      totalOutstandingSet { ${MONEY} }
      shippingAddress { ${ADDRESS} }
      billingAddress { ${ADDRESS} }
      shippingLines(first: 5) { nodes { title originalPriceSet { ${MONEY} } } }
      discountApplications(first: 20) { nodes { __typename ... on DiscountCodeApplication { code } } }
      metafield(namespace: "$app", key: "cfs_status") { value }
      lineItems(first: 250) {
        nodes {
          id title variantTitle sku quantity currentQuantity
          image { url }
          customAttributes { key value }
          originalUnitPriceSet { ${MONEY} }
          discountAllocations { allocatedAmountSet { ${MONEY} } }
        }
      }
    }
  }`;

/** { doc, site } for the documents, or null when Shopify has no such order. Throws when Shopify cannot be read. */
export async function loadDocument(graphql, db, { shop, orderId }) {
  const json = await (await graphql(QUERY, { variables: { id: orderId } })).json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  const order = json.data?.order;
  if (!order) return null;
  const doc = shapeDocOrder(order, order.metafield?.value ?? null);
  const row = doc.siteCode ? await db.emailSite.findUnique({ where: { shop_code: { shop, code: doc.siteCode } } }) : null;
  return { doc, site: siteDetails(row) };
}

/** Writes one line to the delivery notes log. */
export const logDeliveryNote = (db, { shop, orderId, staff }) =>
  db.deliveryNotePrint.create({ data: { shop, orderId, printedById: staff.id, printedBy: staff.name } });

/** [{ at: ISO, by }], newest first. */
export async function deliveryNoteLog(db, { shop, orderId }) {
  const rows = await db.deliveryNotePrint.findMany({ where: { shop, orderId }, orderBy: { printedAt: "desc" }, take: 100 });
  return rows.map((r) => ({ at: r.printedAt.toISOString(), by: r.printedBy }));
}
