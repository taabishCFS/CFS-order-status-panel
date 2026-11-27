import { useSearchParams } from 'react-router';
import { POWER_BI_REPORTS, pickReport } from './powerBi';

// Power BI Analytics (old Accounts menu): choose one of the published Power BI reports; it shows below, full width.
// The choice is kept in the address (?report=), like the old page, so Refresh or a shared link opens the same report.
export default function PowerBiPage() {
  const [params, setParams] = useSearchParams();
  const report = pickReport(params.get('report'));

  return (
    <s-page heading="Power BI Analytics" inlineSize="large">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href={report.url} target="_blank">Open in Power BI</s-button>
      <s-section>
        <s-select label="Report" value={report.name} onChange={(e) => setParams({ report: e.currentTarget.value }, { replace: true })}>
          {POWER_BI_REPORTS.map((r) => <s-option key={r.name} value={r.name}>{r.name}</s-option>)}
        </s-select>
      </s-section>
      <s-section padding="none">
        <iframe key={report.name} title={report.name} src={report.url} allowFullScreen style={{ width: '100%', height: 'calc(100vh - 220px)', minHeight: '480px', border: 0, display: 'block' }} />
      </s-section>
    </s-page>
  );
}
