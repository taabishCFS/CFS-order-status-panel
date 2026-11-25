// The Dashboard page: every screen of the app as a card, grouped by what staff are doing.
export interface DashboardItem {
  href: string;
  title: string;
  description: string;
  icon: string; // a Polaris icon name
}

export interface DashboardGroup {
  heading: string;
  items: DashboardItem[];
}

export const DASHBOARD_GROUPS: DashboardGroup[] = [
  {
    heading: 'Orders',
    items: [
      { href: '/', title: 'Orders', description: 'Every order in one list. Open one to change its status, dates and notes.', icon: 'order' },
      { href: '/orders-by-brand', title: 'Orders by Brand', description: 'One row per product, by supplier brand. Chase suppliers and download the ordering sheets.', icon: 'product' },
      { href: '/supplier-chaseup', title: 'Supplier Chaseup', description: 'Lines due soon: email the supplier a chase-up and update expected dates.', icon: 'clock' },
      { href: '/date-lapsed', title: 'Date Lapsed', description: 'Lines whose expected date has passed and are still waiting on the supplier.', icon: 'alert-circle' },
    ],
  },
  {
    heading: 'Stock',
    items: [
      { href: '/stock', title: 'Stock', description: 'Free stock we already own, so it can be given to an order instead of buying again.', icon: 'inventory' },
      { href: '/containers', title: 'Containers', description: 'Stock arriving in containers, the expected dates and the freight paid, ready to give to an order.', icon: 'delivery' },
      { href: '/sbts', title: 'SBTS / Display', description: 'Goods to send back to the supplier, and showroom display pieces. Mark them collected.', icon: 'return' },
    ],
  },
  {
    heading: 'Delivery',
    items: [
      { href: '/van-management', title: 'Van Management', description: 'The vans, with their driver and co-driver, that you choose from when booking a delivery.', icon: 'delivery' },
      { href: '/driver-management', title: 'Driver Management', description: 'The drivers, with their mobile numbers, who go on the vans.', icon: 'delivery' },
    ],
  },
  {
    heading: 'Money',
    items: [
      { href: '/refunds', title: 'Refund Orders List', description: 'Refund requests waiting to be paid, and the ones already refunded.', icon: 'receipt-refund' },
      { href: '/reports', title: 'Reports', description: 'Download the Xero invoice report, the supplier payment reports and the Delivery Report.', icon: 'chart-vertical' },
    ],
  },
  {
    heading: 'Settings',
    items: [
      { href: '/brand-terms', title: 'Brand terms', description: 'Choose whether each brand is paid on credit or pro-forma.', icon: 'settings' },
      { href: '/email-templates', title: 'Email templates', description: 'Edit the emails customers receive.', icon: 'email' },
      { href: '/suppliers', title: 'Suppliers', description: 'Set each brand\'s supplier email, or mark it as ordered by hand.', icon: 'store' },
      { href: '/permissions', title: 'Permissions', description: 'Choose which staff can change delivery charges, work refunds and print delivery notes.', icon: 'lock' },
    ],
  },
];

/** Every dashboard link, flat. */
export const dashboardLinks = (): string[] => DASHBOARD_GROUPS.flatMap((g) => g.items.map((i) => i.href));
