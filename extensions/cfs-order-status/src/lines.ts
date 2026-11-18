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

// Shopify keeps lines removed in an order edit in lineItems with currentQuantity 0.
// Staff should only see what is on the order now.
export function currentLines(nodes: LineNode[]): OrderLine[] {
  return nodes
    .filter((n) => n.currentQuantity > 0)
    .map((n) => ({ id: n.id, title: n.title, variantTitle: n.variantTitle, quantity: n.currentQuantity }));
}
