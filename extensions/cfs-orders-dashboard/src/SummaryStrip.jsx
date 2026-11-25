// A row of small count tiles above a list: label, big-ish value, and a tone (critical, warning, success, info, neutral).
// Each stat is { label, value, tone? }. Null or undefined values show a dash.
export default function SummaryStrip({ stats }) {
  return (
    <s-grid gridTemplateColumns="repeat(auto-fit, minmax(130px, 1fr))" gap="small">
      {stats.map((s) => (
        <s-box key={s.label} padding="small" border="base" borderRadius="base" background="subdued">
          <s-stack gap="small-500">
            <s-text color="subdued">{s.label}</s-text>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text type="strong">{s.value ?? '–'}</s-text>
              {s.tone && s.tone !== 'neutral' && <s-badge tone={s.tone}>{s.note ?? ''}</s-badge>}
            </s-stack>
          </s-stack>
        </s-box>
      ))}
    </s-grid>
  );
}
