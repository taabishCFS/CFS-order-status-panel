import { DASHBOARD_GROUPS } from './dashboard';

// The Dashboard: one card per screen, grouped by what staff are doing. Each card is a single large link.
export default function DashboardPage() {
  return (
    <s-page heading="Dashboard">
      <s-section>
        <s-stack gap="small-200">
          <s-heading>Welcome to the CFS Order Panel</s-heading>
          <s-text color="subdued">Pick what you want to do. You can come back here from the Dashboard button at the top of any page.</s-text>
        </s-stack>
      </s-section>

      {DASHBOARD_GROUPS.map((group) => (
        <s-section key={group.heading} heading={group.heading}>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
            {group.items.map((item) => (
              <s-clickable key={item.href} href={item.href} accessibilityLabel={`${item.title}: ${item.description}`} border="base" borderRadius="large" padding="base">
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
