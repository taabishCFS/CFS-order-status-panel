import { useState } from 'preact/hooks';
import { useStaff } from './useStaff';
import { REPORTS, loadReportLink, rangeProblem } from './reports';

// The Reports screen: one card per report, a date range where the report needs one, and a download button.
export default function ReportsPage() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const staff = useStaff(); // undefined while checking, null when nobody can be verified

  async function download(report) {
    if (report.needsDates) {
      const problem = rangeProblem(range.from, range.to);
      if (problem) { setNotice({ tone: 'warning', text: problem }); return; }
    }
    setBusy(report.kind);
    const res = await loadReportLink(report.kind, report.needsDates ? range : null);
    setBusy(null);
    setNotice(res.ok
      ? { tone: 'success', text: `${report.title} is ready (the link works for 5 minutes).`, link: res.data }
      : { tone: 'critical', text: res.message });
  }

  return (
    <s-page heading="Reports">
      <s-button slot="secondary-actions" href="/">Orders</s-button>
      <s-button slot="secondary-actions" href="/orders-by-brand">Orders by Brand</s-button>
      <s-button slot="secondary-actions" href="/refunds">Refund Orders List</s-button>
      <s-button slot="secondary-actions" href="/brand-terms">Brand terms</s-button>

      {staff === null && <s-banner tone="warning">Downloading reports needs a verified Shopify staff sign-in.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.link && <s-link href={notice.link.url} target="_blank">Download {notice.link.filename}</s-link>}
        </s-banner>
      )}

      {REPORTS.map((report) => (
        <s-section key={report.kind} heading={report.title}>
          <s-stack gap="base">
            <s-text>{report.description}</s-text>
            {report.needsDates && (
              <s-stack direction="inline" gap="base" alignItems="end">
                <s-date-field label="Date from" value={range.from} onChange={(e) => setRange({ ...range, from: e.currentTarget.value })} />
                <s-date-field label="Date to" value={range.to} onChange={(e) => setRange({ ...range, to: e.currentTarget.value })} />
              </s-stack>
            )}
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" onClick={() => download(report)} loading={busy === report.kind || undefined} disabled={!staff || undefined}>
                Download {report.title}
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      ))}
    </s-page>
  );
}
