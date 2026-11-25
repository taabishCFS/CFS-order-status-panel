import { useState } from 'react';
import { callBackendResult } from './backend';
import { describeEmail } from './emails';

const MODE = { log: 'Emails: log mode (nothing is sent)', test: 'Emails: test mode', live: 'Emails: live' };

// The emails queued, sent or failed for this order, with Retry on the failed ones.
export default function EmailsSection({ emails, canRetry }) {
  const { info, error, reload } = emails;
  const [retrying, setRetrying] = useState(null);
  const [problem, setProblem] = useState(null);

  async function retry(id) {
    setRetrying(id);
    setProblem(null);
    try {
      const res = await callBackendResult(`api/emails/${id}/retry`, { method: 'POST' });
      if (!res.ok) setProblem(res.status === 403 ? 'Shopify did not say who is signed in, so the email was not retried.' : 'That email could not be retried.');
    } catch {
      setProblem('Could not reach the backend.');
    }
    setRetrying(null);
    await reload();
  }

  return (
    <s-section heading={`Emails${info ? ` (${info.emails.length})` : ''}`}>
      <s-stack direction="block" gap="small">
        {error && <s-banner tone="warning">Emails could not be loaded: {error}</s-banner>}
        {info && <s-text>{info.enabled ? MODE[info.mode] ?? `Emails: ${info.mode}` : 'Emails: off'}</s-text>}
        {problem && <s-banner tone="warning">{problem}</s-banner>}
        {info && info.emails.length === 0 && <s-text>No emails for this order yet.</s-text>}
        {info?.emails.map((row) => (
          <s-stack key={row.id} direction="inline" gap="small" alignItems="center">
            <s-text>{describeEmail(row)}</s-text>
            {row.status === 'failed' && (
              <s-button disabled={!canRetry || retrying === row.id || undefined} loading={retrying === row.id || undefined} onClick={() => retry(row.id)}>Retry</s-button>
            )}
          </s-stack>
        ))}
        <s-button onClick={reload}>Refresh emails</s-button>
      </s-stack>
    </s-section>
  );
}
