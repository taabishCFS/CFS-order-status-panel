// A friendly "nothing here" message: a title, one line of help, and an optional action link.
export default function EmptyState({ title, hint, href, action }) {
  return (
    <s-box padding="large">
      <s-stack gap="small-200" alignItems="center">
        <s-icon type="search" tone="neutral" />
        <s-heading>{title}</s-heading>
        {hint && <s-text color="subdued">{hint}</s-text>}
        {href && action && <s-link href={href}>{action}</s-link>}
      </s-stack>
    </s-box>
  );
}
