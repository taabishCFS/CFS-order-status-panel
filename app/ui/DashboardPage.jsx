import { useEffect, useState } from 'react';
import { DASHBOARD_GROUPS } from './dashboard';
import { buildTiles, loadCounts } from './dashboardCounts';

// The Dashboard: a row of live number tiles (red when overdue, amber when work is waiting, green when clear),
// then one card per screen, grouped by what staff are doing. Each card is a single large link.
export default function DashboardPage() {
  const [counts, setCounts] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadCounts().then((c) => (c ? setCounts(c) : setFailed(true))); }, []);
  const tiles = buildTiles(counts);

  return (
    <s-page heading="Dashboard">
      <s-section>
        <s-stack gap="small-200">
          <s-heading>Welcome to the CFS Order Panel</s-heading>
          <s-text color="subdued">Here is what needs attention today. Press a tile to open it, or pick a screen below.</s-text>
        </s-stack>
      </s-section>

      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))" gap="base">
          {tiles.map((t) => (
            <s-clickable key={t.key} href={t.href} accessibilityLabel={`${t.label}: ${t.value ?? 'loading'} ${t.hint}`} border="base" borderRadius="large" padding="base" background="subdued">
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="small" alignItems="center" justifyContent="space-between">
                  <s-text color="subdued">{t.label}</s-text>
                  <s-icon type={t.icon} tone={t.tone} />
                </s-stack>
                <s-heading size="large"><s-text tone={t.tone}>{t.value === null ? (failed ? '–' : '…') : t.value}</s-text></s-heading>
                <s-badge tone={t.tone}>{t.hint}</s-badge>
              </s-stack>
            </s-clickable>
          ))}
        </s-grid>
        {failed && <s-text color="subdued">The numbers could not be loaded. The screens below still work.</s-text>}
      </s-section>

      {DASHBOARD_GROUPS.map((group) => (
        <s-section key={group.heading} heading={group.heading}>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
            {group.items.map((item) => (
              <s-clickable key={item.href} href={item.href} target={item.external ? '_blank' : undefined} accessibilityLabel={`${item.title}: ${item.description}`} border="base" borderRadius="large" padding="base">
                <s-stack gap="small-200">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-icon type={item.icon} />
                    <s-heading>{item.title}</s-heading>
                  </s-stack>
                  <s-text color="subdued">{item.description}</s-text>
                </s-stack>
              </s-clickable>
            ))}
          </s-grid>
        </s-section>
      ))}
    </s-page>
  );
}
