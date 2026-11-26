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
      { href: '/instock-balance', title: 'Instock Balance Due', description: 'Orders that still owe money while every item is in stock or on its way. Download the ticked ones.', icon: 'cash-dollar' },
      { href: '/refunds', title: 'Refund Orders List', description: 'Refund requests waiting to be paid, and the ones already refunded.', icon: 'receipt-refund' },
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
      { href: '/book-delivery', title: 'Book Delivery', description: 'Tick the orders that are ready, mark TNT or Pallet, or book them onto a van with drops and times and email the customers.', icon: 'delivery' },
      { href: '/delivery-booked', title: 'Delivery Booked', description: 'See every booked delivery by day, van and driver in drop order. Change drops, reschedule, and download the day, a Pick List or a Driver Sheet.', icon: 'delivery' },
      { href: '/delivery-completed', title: 'Completed Delivery', description: 'Lines that have been delivered, by day, van or carrier, pay mode and brand, with the final value. Download the list.', icon: 'delivery' },
      { href: '/delivery-failed', title: 'Failed Delivery/Collection', description: 'Lines whose delivery or collection failed, with the driver and the reason. Download the list.', icon: 'delivery' },
      { href: '/on-hold-delivery', title: 'On Hold Delivery', description: 'Lines on hold for delivery, shown in Orders by Brand so you can change their status.', icon: 'delivery' },
      { href: '/tnt-orders', title: 'TNT Orders', description: 'Lines marked for TNT, with the delivery date and email status. Email the customers and download the list.', icon: 'delivery' },
      { href: '/pallet-orders', title: 'Pallet Orders', description: 'Lines marked for Pallet delivery. Email the customers and download the list.', icon: 'delivery' },
      { href: '/furdeco-orders', title: 'FurDeco Orders', description: 'Lines marked for Fur Deco. Email the customers and download the list.', icon: 'delivery' },
      { href: '/dhd-orders', title: 'DHD Orders', description: 'Lines with the DHD with Supplier status. Email the customers and download the list.', icon: 'delivery' },
      { href: '/white-glove-orders', title: 'White Glove Delivery Orders', description: 'Lines on orders that bought White Glove delivery. Email the customers and download the list.', icon: 'delivery' },
      { href: '/supplier-collection', title: 'Supplier Collection', description: 'Plan a pick-up from a supplier: choose the brand, the van and the day.', icon: 'delivery' },
      { href: '/instock-not-booked', title: 'Instock Delivery Not Booked', description: 'Items that are in stock or on their way but have no delivery date yet. Filter by payment and download the ticked ones.', icon: 'delivery' },
      { href: '/allocated-booked', title: 'Allocated From Stock + Delivery Booked', description: 'Part-order-in-stock lines that are already booked onto a van, with the date and van.', icon: 'delivery' },
      { href: '/maxpro', title: 'Delivery Report CSV (Max)', description: 'Every paid order still to deliver, with the Maxpro columns. Filter by brand, send a delivery update email, and export the Order Wise or Product Wise file for Maxpro.', icon: 'delivery' },
      { href: '/areas', title: 'Area', description: 'Name groups of postcodes (such as NE, DH, SR) so delivery lists can be narrowed by area.', icon: 'delivery' },
      { href: '/van-management', title: 'Van Management', description: 'The vans, with their driver and co-driver, that you choose from when booking a delivery.', icon: 'delivery' },
      { href: '/driver-management', title: 'Driver Management', description: 'The drivers, with their mobile numbers, who go on the vans.', icon: 'delivery' },
    ],
  },
  {
    heading: 'Accounts',
    items: [
      { href: '/supplier-payments', title: 'Supplier Payments', description: 'Your own list of items to pay suppliers for, added with Add To Accounts on an order. Mark them Paid or Not Paid.', icon: 'cash-dollar' },
      { href: '/proforma-payment-report', title: 'Proforma Payment Report', description: 'Items of pro-forma brands waiting for payment, with the invoice amount with and without VAT. Download the ticked ones.', icon: 'cash-dollar' },
      { href: '/credit-payment-report', title: 'Credit Payment Report', description: 'Items of credit brands that are In Stock, with the invoice amount with and without VAT. Download the ticked ones.', icon: 'cash-dollar' },
      { href: '/minerva-orders', title: 'Minerva Supplier Orders', description: 'For brands that give a Minerva discount: what we paid them inside and outside the discount dates, and the discount due. Set the Minerva brands here.', icon: 'cash-dollar' },
      { href: '/reschedule-orders', title: 'Reschedule Delivery Orders', description: 'Items rescheduled after a delivery attempt, with any charge the customer agreed to and how many times. Download the ticked ones.', icon: 'delivery' },
      { href: '/pay-to-supplier', title: 'Pay To Supplier', description: 'Lines we still owe a supplier for: check the cost, add the invoice number and mark them paid.', icon: 'cash-dollar' },
      { href: '/supplier-paid', title: 'Supplier Paid', description: 'Lines already paid to suppliers, grouped by batch invoice. Mark one unpaid if it was a mistake.', icon: 'receipt-refund' },
    ],
  },
  {
    heading: 'Downloads',
    items: [
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
