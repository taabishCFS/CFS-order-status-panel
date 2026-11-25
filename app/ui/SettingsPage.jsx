import { DASHBOARD_GROUPS } from './dashboard';

// Settings: the four screens that change how the app behaves, as cards (the same ones the Dashboard lists under Settings).
export default function SettingsPage() {
  const group = DASHBOARD_GROUPS.find((g) => g.heading === 'Settings');
  return (
    <s-page heading="Settings">
      <s-section>
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
    </s-page>
  );
}
