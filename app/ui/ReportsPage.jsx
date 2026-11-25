import { useState } from 'react';
import { useStaff } from './useStaff';
import { REPORTS, TERMS_CHOICES, loadReportLink, rangeProblem } from './reports';

// The Reports screen: one card per report, a date range and pay terms where the report needs them, and a download button.
export default function ReportsPage() {
  const [ranges, setRanges] = useState({}); // each report keeps its own dates
  const [terms, setTerms] = useState('credit');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const staff = useStaff(); // undefined while checking, null when nobody can be verified

  const rangeOf = (kind) => ranges[kind] ?? { from: '', to: '' };
  const setRange = (kind, part, value) => setRanges((all) => ({ ...all, [kind]: { ...rangeOf(kind), [part]: value } }));

  async function download(report) {
    const range = rangeOf(report.kind);
    if (report.needsDates) {
      const problem = rangeProblem(range.from, range.to);
      if (problem) { setNotice({ tone: 'warning', text: problem }); return; }
    }
    setBusy(report.kind);
    const res = await loadReportLink(report.kind, report.needsDates ? range : null, undefined, report.needsTerms ? terms : undefined);
    setBusy(null);
    setNotice(res.ok
      ? { tone: 'success', text: `${report.title} is ready (the link works for 5 minutes).`, link: res.data }
      : { tone: 'critical', text: res.message });
  }

  return (
    <s-page heading="Reports">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
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
            {report.needsTerms && (
              <s-select label="Brands paid on" value={terms} onChange={(e) => setTerms(e.currentTarget.value)}>
                {TERMS_CHOICES.map((c) => <s-option key={c.value} value={c.value}>{c.label}</s-option>)}
              </s-select>
            )}
            {report.needsDates && (
              <s-stack direction="inline" gap="base" alignItems="end">
                <s-date-field label="Date from" value={rangeOf(report.kind).from} onChange={(e) => setRange(report.kind, 'from', e.currentTarget.value)} />
                <s-date-field label="Date to" value={rangeOf(report.kind).to} onChange={(e) => setRange(report.kind, 'to', e.currentTarget.value)} />
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
