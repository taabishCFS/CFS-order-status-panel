import { describe, expect, it } from 'vitest';
import { POWER_BI_REPORTS, pickReport } from './powerBi';

describe('Power BI Analytics', () => {
  it('has the four old reports, all on Power BI', () => {
    expect(POWER_BI_REPORTS.map((r) => r.name)).toEqual(['Brand Report', 'UD Report', 'UD Spend Report', 'Hour Report']);
    for (const r of POWER_BI_REPORTS) expect(r.url.startsWith('https://app.powerbi.com/view?r=')).toBe(true);
  });
  it('picks the named report, else the Brand Report', () => {
    expect(pickReport('Hour Report').name).toBe('Hour Report');
    expect(pickReport(null).name).toBe('Brand Report');
    expect(pickReport('Nope').name).toBe('Brand Report');
  });
});
