import db from "../db.server";
import { parseSupplierSalesParams, supplierSales } from "../orders/supplier-sales.server";
import { authenticate } from "../shopify.server";

// GET ?from=&to=&detail=1: the Supplier Sales Summary (per website and brand; with detail, each brand's orders). Read only.
// This loader also answers the browser's OPTIONS preflight.
export const loader = async ({ request }) => {
  const { session, cors } = await authenticate.admin(request);
  const p = parseSupplierSalesParams(new URL(request.url).searchParams);
  return cors(Response.json(await supplierSales(db, session.shop, p)));
};
