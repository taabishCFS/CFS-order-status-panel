import { describe, expect, it } from 'vitest';
import { DASHBOARD_GROUPS, dashboardLinks } from './dashboard';

describe('dashboard', () => {
  it('links to every screen of the app once', () => {
    expect(dashboardLinks().sort()).toEqual(['/', '/allocated-booked', '/areas', '/book-delivery', '/brand-terms', '/containers', '/credit-payment-report', '/date-lapsed', '/delivery-booked', '/delivery-completed', '/delivery-failed', '/dhd-orders', '/driver-management', '/email-templates', '/furdeco-orders', '/instock-balance', '/instock-not-booked', '/maxpro', '/minerva-orders', '/on-hold-delivery', '/orders-by-brand', '/pallet-orders', '/pay-to-supplier', '/permissions', '/power-bi', '/proforma-payment-report', '/refunds', '/reports?report=delivery', '/reports?report=instock', '/reports?report=outstanding', '/reports?report=unpaid', '/reports?report=xero', '/reschedule-orders', '/sbts', '/stock', '/supplier-chaseup', '/supplier-collection', '/supplier-paid', '/supplier-payments', '/suppliers', '/tnt-orders', '/van-management', '/white-glove-orders', 'https://www.choicefurnituresuperstore.co.uk/PLA/sales_report.php']);
    expect(new Set(dashboardLinks()).size).toBe(dashboardLinks().length);
  });
  it('gives every card a title, a plain description and an icon, and every group a heading', () => {
    for (const g of DASHBOARD_GROUPS) {
      expect(g.heading).not.toBe('');
      for (const i of g.items) {
        expect(i.title).not.toBe('');
        expect(i.description.length).toBeGreaterThan(10);
        expect(i.icon).not.toBe('');
        expect(i.external ? i.href.startsWith('https://') : i.href.startsWith('/')).toBe(true);
      }
    }
  });
});
