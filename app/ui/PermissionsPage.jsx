import { useEffect, useState } from 'react';
import { loadPermissions, savePermissions, toggleKey } from './permissions';

// Who may do the restricted actions. Until a manager exists everyone can do everything; ticking "Manage permissions" for someone switches the rules on.
export default function PermissionsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  async function load() {
    const res = await loadPermissions();
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }
  useEffect(() => { load(); }, []);

  async function toggle(person, key) {
    setBusy(person.staffId + key);
    const res = await savePermissions(person.staffId, toggleKey(person.keys, key));
    setBusy(null);
    setNotice(res.ok ? { tone: 'success', text: `Saved ${person.name}.` } : { tone: 'critical', text: res.message });
    load();
  }

  const me = data?.me;
  return (
    <s-page heading="Permissions">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      {error && <s-banner tone="critical" heading="Could not load permissions">{error}</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}
      {me && !me.restricted && <s-banner tone="warning" heading="Nobody is restricted yet">Everyone can do everything. Tick Manage permissions for the people who should run this page; from then on each person can only do what is ticked for them. Tick it for yourself first.</s-banner>}
      {me && !me.canManage && <s-banner tone="info">Only a manager can change permissions. You can do: {me.keys.length ? data.permissions.filter((p) => me.keys.includes(p.key)).map((p) => p.label).join(', ') : 'none of the restricted actions'}.</s-banner>}
      {me?.canManage && (
        <s-section heading="Staff">
          <s-stack gap="base">
            <s-text>People appear here after they open the app once.</s-text>
            {data.staff.length === 0 && <s-text>Nobody has opened the app yet.</s-text>}
            {data.staff.map((person) => (
              <s-box key={person.staffId} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="small-200">
                  <s-text type="strong">{person.name}{person.staffId === me.id ? ' (you)' : ''}</s-text>
                  {data.permissions.map((p) => (
                    <s-checkbox key={p.key} label={`${p.label} - ${p.detail}`} checked={person.keys.includes(p.key)} disabled={busy !== null || undefined} onChange={() => toggle(person, p.key)} />
                  ))}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}
