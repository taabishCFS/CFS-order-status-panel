import { useEffect, useState } from 'preact/hooks';
import EmptyState from './EmptyState.jsx';
import { useStaff } from './useStaff';
import { changeFleet, loadFleet } from './delivery';

const KINDS = [
  { kind: 'van', key: 'vans', heading: 'Vans', noun: 'van', extraLabel: 'Registration (optional)', hint: 'Add the vans that make deliveries. Orders are booked onto a van and a drop number.' },
  { kind: 'driver', key: 'drivers', heading: 'Drivers', noun: 'driver', extraLabel: 'Phone (optional)', hint: 'Add each driver so they can be chosen when a delivery is booked.' },
  { kind: 'slot', key: 'slots', heading: 'Delivery slots', noun: 'slot', extraLabel: null, hint: 'Time slots such as "8am to 12pm" or "All day", shown on a booking.' },
];

function FleetList({ spec, items, canEdit, onChange, setNotice }) {
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [editing, setEditing] = useState(null); // { id, name, extra }
  const [busy, setBusy] = useState(false);

  async function run(change, done) {
    setBusy(true);
    const res = await changeFleet({ kind: spec.kind, ...change });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    onChange(res.data);
    if (done) done();
  }

  const add = () => run({ op: 'add', name, extra }, () => { setName(''); setExtra(''); setNotice({ tone: 'success', text: `Added ${name.trim()}.` }); });
  const rename = () => run({ op: 'rename', id: editing.id, name: editing.name, extra: editing.extra }, () => { setEditing(null); setNotice({ tone: 'success', text: 'Saved.' }); });

  return (
    <s-section heading={spec.heading}>
      <s-stack gap="base">
        <s-text color="subdued">{spec.hint}</s-text>
        {canEdit && (
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field label={`New ${spec.noun} name`} value={name} onInput={(e) => setName(e.currentTarget.value)} />
            {spec.extraLabel && <s-text-field label={spec.extraLabel} value={extra} onInput={(e) => setExtra(e.currentTarget.value)} />}
            <s-button variant="primary" disabled={!name.trim() || busy || undefined} loading={busy || undefined} onClick={add}>Add {spec.noun}</s-button>
          </s-stack>
        )}
        {items.length === 0 && <EmptyState title={`No ${spec.heading.toLowerCase()} yet`} hint={canEdit ? `Type a name above and press Add ${spec.noun}.` : 'A manager with the Van Management permission can add them.'} />}
        {items.map((i) => (
          <s-box key={i.id} padding="small" border="base" borderRadius="base">
            {editing?.id === i.id ? (
              <s-stack direction="inline" gap="base" alignItems="end">
                <s-text-field label="Name" value={editing.name} onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />
                {spec.extraLabel && <s-text-field label={spec.extraLabel} value={editing.extra} onInput={(e) => setEditing({ ...editing, extra: e.currentTarget.value })} />}
                <s-button variant="primary" disabled={!editing.name.trim() || busy || undefined} onClick={rename}>Save</s-button>
                <s-button onClick={() => setEditing(null)}>Cancel</s-button>
              </s-stack>
            ) : (
              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-text type="strong">{i.name}</s-text>
                  {i.extra && <s-text color="subdued">{i.extra}</s-text>}
                  {!i.active && <s-badge tone="neutral">Not in use</s-badge>}
                </s-stack>
                {canEdit && (
                  <s-stack direction="inline" gap="small">
                    <s-button variant="tertiary" disabled={busy || undefined} onClick={() => setEditing({ id: i.id, name: i.name, extra: i.extra })}>Rename</s-button>
                    {i.active
                      ? <s-button variant="tertiary" tone="critical" disabled={busy || undefined} onClick={() => run({ op: 'deactivate', id: i.id })}>Stop using</s-button>
                      : <s-button variant="tertiary" disabled={busy || undefined} onClick={() => run({ op: 'restore', id: i.id })}>Use again</s-button>}
                  </s-stack>
                )}
              </s-stack>
            )}
          </s-box>
        ))}
      </s-stack>
    </s-section>
  );
}

// Van Management: the vans, drivers and delivery slots staff choose from when booking a delivery.
export default function VanManagementPage() {
  const [fleet, setFleet] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const staff = useStaff();

  useEffect(() => { loadFleet().then((r) => (r.ok ? setFleet(r.data) : setError(r.message))); }, []);

  return (
    <s-page heading="Van Management">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      {error && <s-banner tone="critical" heading="Could not load the lists">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing these lists needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}
      {!fleet && !error && <s-spinner accessibilityLabel="Loading" />}
      {fleet && KINDS.map((spec) => (
        <FleetList key={spec.kind} spec={spec} items={fleet[spec.key]} canEdit={!!staff} onChange={setFleet} setNotice={setNotice} />
      ))}
    </s-page>
  );
}
