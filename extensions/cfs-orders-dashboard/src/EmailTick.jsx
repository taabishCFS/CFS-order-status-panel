import { queueEmail } from './emails';

const OFF_REASON = {
  not_configured: 'email is not set up on the backend',
  smtp_not_built: 'the SMTP provider is not built yet',
  unknown_provider: 'the email provider setting is not recognised',
  unknown_mode: 'the email mode setting is not recognised',
  live_outside_production: 'live sending is only allowed in production',
  provider_needed: 'an email provider is needed',
  no_allowlist: 'test mode needs a list of allowed addresses',
  no_api_key: 'the email provider key is missing',
};

// "Email the customer" tick-box, disabled with the reason when the backend will not send.
export default function EmailTick({ emails, checked, onChange }) {
  const { info, error } = emails;
  const off = !info || !info.enabled;
  const reason = error ? 'the email status could not be loaded' : !info ? 'checking email status' : OFF_REASON[info.reason] ?? info.reason ?? 'email is off';
  const note = info?.enabled && info.mode !== 'live' ? (info.mode === 'log' ? 'Emails are only logged, not sent (log mode).' : 'Test mode: only allowed test addresses receive email.') : null;
  return (
    <s-stack direction="block" gap="small-300">
      <s-checkbox label="Email the customer" disabled={off || undefined} checked={!off && checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      {off && <s-text>Customer email is off: {reason}.</s-text>}
      {note && <s-text>{note}</s-text>}
    </s-stack>
  );
}

// After a successful save with the tick on: queue the email, then refresh the list. The save is never undone.
export async function sendAfterSave({ body, setNotice, emails }) {
  const result = await queueEmail(body);
  if (!result.ok) setNotice({ tone: 'warning', text: `Saved, but the email could not be queued: ${result.message}` });
  else if (result.recipients.length) setNotice({ tone: 'success', text: `Saved. Email to ${result.recipients.join(', ')} is on its way: see the Emails list at the bottom of the page for its status.` });
  else setNotice({ tone: 'warning', text: 'Saved, but no email was sent: this order has no customer email address.' });
  await emails.reload();
  // The worker sends within seconds; look again so the list shows the final status.
  setTimeout(() => emails.reload(), 4000);
}
