import db from "../db.server";
import { deliveryNoteHtml, deliveryNotesHtml, invoiceHtml, labelHtml, returnLabelHtml, savePdfHtml } from "../orders/document-pages";
import { loadDocument } from "../orders/documents.server";
import { verifyExportLink } from "../orders/export-link.server";
import { unauthenticated } from "../shopify.server";

const refuse = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// GET ?t=<signed link>: a printable order document (made by /api/orders/:id/document for verified staff; the link is the proof).
export const loader = async ({ request }) => {
  const link = verifyExportLink(new URL(request.url).searchParams.get("t"), process.env.SHOPIFY_API_SECRET);
  if (!link.ok) return refuse(403, link.reason === "expired" ? "This link has expired. Go back to the order and press the button again." : "This link is not valid.");
  const kind = String(link.kind ?? "");
  if (!kind.startsWith("doc-")) return refuse(400, "Unknown document.");

  const query = new URLSearchParams(link.query);
  if (kind === "doc-delivery-notes") {
    const numbers = (query.get("orders") ?? "").split(",").filter(Boolean);
    if (numbers.length === 0 || numbers.length > 50 || !numbers.every((n) => /^\d{1,20}$/.test(n))) return refuse(400, "Unknown document.");
    try {
      const { admin } = await unauthenticated.admin(link.shop);
      const items = [];
      for (const n of numbers) {
        const found = await loadDocument(admin.graphql, db, { shop: link.shop, orderId: `gid://shopify/Order/${n}` });
        if (found) items.push(found);
      }
      if (items.length === 0) return refuse(404, "Order not found.");
      return new Response(deliveryNotesHtml(items), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } catch (error) {
      console.error("Delivery notes page failed", error?.message ?? error);
      return refuse(502, "Shopify could not be read just now. Try again shortly.");
    }
  }
  const orderNumber = query.get("order") ?? "";
  if (!/^\d{1,20}$/.test(orderNumber)) return refuse(400, "Unknown document.");

  let found;
  try {
    const { admin } = await unauthenticated.admin(link.shop);
    found = await loadDocument(admin.graphql, db, { shop: link.shop, orderId: `gid://shopify/Order/${orderNumber}` });
  } catch (error) {
    console.error(`Document page ${orderNumber} failed`, error?.message ?? error);
    return refuse(502, "Shopify could not be read just now. Try again shortly.");
  }
  if (!found) return refuse(404, "Order not found.");
  const { doc, site } = found;

  let html;
  switch (kind) {
    case "doc-invoice": html = savePdfHtml(doc, site); break;
    case "doc-exc-vat": html = invoiceHtml(doc, site, { vat: false }); break;
    case "doc-inc-vat": html = invoiceHtml(doc, site, { vat: true }); break;
    case "doc-delivery-note": html = deliveryNoteHtml(doc, site); break;
    case "doc-label": html = labelHtml(doc); break;
    case "doc-return-label": html = returnLabelHtml(doc, (query.get("lineIds") ?? "").split(",").filter(Boolean), query.get("type") ?? ""); break;
    default: return refuse(400, "Unknown document.");
  }
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};
