import { describe, expect, it } from 'vitest';
import { DASHBOARD_GROUPS, dashboardLinks } from './dashboard';

describe('dashboard', () => {
  it('links to every screen of the app once', () => {
    expect(dashboardLinks().sort()).toEqual(['/', '/brand-terms', '/containers', '/email-templates', '/orders-by-brand', '/refunds', '/reports', '/stock']);
    expect(new Set(dashboardLinks()).size).toBe(dashboardLinks().length);
  });
  it('gives every card a title, a plain description and an icon, and every group a heading', () => {
    for (const g of DASHBOARD_GROUPS) {
      expect(g.heading).not.toBe('');
      for (const i of g.items) {
        expect(i.title).not.toBe('');
        expect(i.description.length).toBeGreaterThan(10);
        expect(i.icon).not.toBe('');
        expect(i.href.startsWith('/')).toBe(true);
      }
    }
  });
});
