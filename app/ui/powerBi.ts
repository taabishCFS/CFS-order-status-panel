// Power BI Analytics (old Accounts menu, legacy powerBi.inc): four published Power BI reports, chosen from a list and shown in the page.
// These are the same "publish to web" links the old admin used.
export const POWER_BI_REPORTS = [
  { name: 'Brand Report', url: 'https://app.powerbi.com/view?r=eyJrIjoiZTBmMTE3ZDAtNjQxMi00MmMyLWIwZTctZTRmOTE4YTIzOWE3IiwidCI6IjllYmM2OGZiLTY2NjItNDM2NC1hOTYyLTBiOWVkODgxOWI5MiJ9' },
  { name: 'UD Report', url: 'https://app.powerbi.com/view?r=eyJrIjoiNzk4OWM1ZGUtOTcyYS00YTEzLWE4MTctZmQ1NzJmZmNmOTZkIiwidCI6IjllYmM2OGZiLTY2NjItNDM2NC1hOTYyLTBiOWVkODgxOWI5MiJ9' },
  { name: 'UD Spend Report', url: 'https://app.powerbi.com/view?r=eyJrIjoiYTI2NGNiYWQtYzM5Yi00MjZiLTg5N2ItYjQ0N2M3ZDNjNGQ3IiwidCI6IjllYmM2OGZiLTY2NjItNDM2NC1hOTYyLTBiOWVkODgxOWI5MiJ9' },
  { name: 'Hour Report', url: 'https://app.powerbi.com/view?r=eyJrIjoiN2QyYjVjOWYtNDU2Mi00OGE5LWE4MWItY2Q5YTQxYWEzYTkzIiwidCI6IjllYmM2OGZiLTY2NjItNDM2NC1hOTYyLTBiOWVkODgxOWI5MiJ9' },
] as const;

/** The report named in ?report=, or the Brand Report (as the old page did for a missing or unknown name). */
export function pickReport(name: string | null) {
  return POWER_BI_REPORTS.find((r) => r.name === name) ?? POWER_BI_REPORTS[0];
}
