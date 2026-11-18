export interface LineNode {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  currentQuantity: number;
}

export interface OrderLine {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
}

// Titles of lines removed in an order edit, so statuses saved against them stay readable.
export function removedLineInfo(nodes: LineNode[]): Record<string, { title: string; variantTitle: string | null }> {
  const info: Record<string, { title: string; variantTitle: string | null }> = {};
  for (const n of nodes) if (n.currentQuantity <= 0) info[n.id] = { title: n.title, variantTitle: n.variantTitle };
  return info;
}

// Shopify keeps lines removed in an order edit in lineItems with currentQuantity 0.
// Staff should only see what is on the order now.
export function currentLines(nodes: LineNode[]): OrderLine[] {
  return nodes
    .filter((n) => n.currentQuantity > 0)
    .map((n) => ({ id: n.id, title: n.title, variantTitle: n.variantTitle, quantity: n.currentQuantity }));
}
