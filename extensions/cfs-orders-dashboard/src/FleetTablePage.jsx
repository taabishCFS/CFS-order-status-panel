import { useEffect, useState } from 'preact/hooks';
import EmptyState from './EmptyState.jsx';
import { useStaff } from './useStaff';
import { bulkFleetChange, bulkText, changeFleet, loadFleet } from './delivery';

const find = (list, id) => list.find((x) => x.id === id);

// A list page laid out like the old system: a title bar with ADD NEW / INACTIVE / ACTIVE / DELETE,
// then a table with a tick box on every row. `kind` is 'van' or 'driver'.
export default function FleetTablePage({ kind }) {
  const isVan = kind === 'van';
  const title = isVan ? 'Van' : 'Driver';
  const staff = useStaff();
  const [fleet, setFleet] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [ticked, setTicked] = useState([]);
  const [form, setForm] = useState(null); // { id?, name, phone, driverId, coDriverId }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadFleet().then((r) => (r.ok ? setFleet(r.data) : setError(r.message))); }, []);

  const rows = fleet ? (isVan ? fleet.vans : fleet.drivers) : [];
  const drivers = fleet?.drivers ?? [];
  const canEdit = !!staff;
  const allTicked = rows.length > 0 && ticked.length === rows.length;
  const toggle = (id, on) => setTicked((t) => (on ? [...new Set([...t, id])] : t.filter((x) => x !== id)));

  async function bulk(action) {
    setBusy(true);
    const res = await bulkFleetChange(kind, action, ticked);
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setFleet(res.data.fleet);
    setTicked([]);
    setNotice({ tone: res.data.blocked.length > 0 ? 'warning' : 'success', text: bulkText(kind, action, res.data) });
  }

  async function save() {
    setBusy(true);
    const res = await changeFleet({
      kind, op: form.id ? 'rename' : 'add', id: form.id, name: form.name, extra: form.phone,
      ...(isVan ? { driverId: form.driverId, coDriverId: form.coDriverId } : {}),
    });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setFleet(res.data);
    setNotice({ tone: 'success', text: form.id ? 'Saved.' : `Added ${form.name.trim()}.` });
    setForm(null);
  }

  const edit = (r) => setForm({ id: r.id, name: r.name, phone: r.extra ?? '', driverId: r.driverId ?? '', coDriverId: r.coDriverId ?? '' });
  const driverOptions = (
    <>
      <s-option value="">-- None --</s-option>
      {drivers.filter((d) => d.active).map((d) => <s-option key={d.id} value={d.id}>{d.name}</s-option>)}
    </>
  );

  return (
    <s-page heading={`${title} Management`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing this list needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}
      {!fleet && !error && <s-spinner accessibilityLabel="Loading" />}

      {fleet && (
        <s-section>
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-heading>{title}</s-heading>
                <s-text color="subdued">Showing {rows.length} record{rows.length === 1 ? '' : 's'}</s-text>
              </s-stack>
              {canEdit && (
                <s-stack direction="inline" gap="small">
                  <s-button variant="primary" disabled={busy || undefined} onClick={() => setForm({ name: '', phone: '', driverId: '', coDriverId: '' })}>ADD NEW</s-button>
                  <s-button disabled={ticked.length === 0 || busy || undefined} onClick={() => bulk('deactivate')}>INACTIVE</s-button>
                  <s-button disabled={ticked.length === 0 || busy || undefined} onClick={() => bulk('activate')}>ACTIVE</s-button>
                  <s-button tone="critical" disabled={ticked.length === 0 || busy || undefined} onClick={() => setConfirmDelete(true)}>DELETE</s-button>
                </s-stack>
              )}
            </s-stack>

            {confirmDelete && (
              <s-banner tone="critical" heading={`Delete ${ticked.length} ${kind}${ticked.length === 1 ? '' : 's'}?`}>
                This cannot be undone. {isVan ? 'Vans' : 'Drivers'} that are on a booking{isVan ? '' : ' or a van'} are kept; make those inactive instead.
                <s-button slot="primary-action" tone="critical" disabled={busy || undefined} loading={busy || undefined} onClick={() => bulk('delete')}>Delete</s-button>
                <s-button slot="secondary-actions" onClick={() => setConfirmDelete(false)}>Cancel</s-button>
              </s-banner>
            )}

            {form && (
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack gap="base">
                  <s-text type="strong">{form.id ? `Edit ${title}` : `Add ${title}`}</s-text>
                  <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
                    <s-text-field label={`${title} name`} value={form.name} onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} />
                    {!isVan && <s-text-field label="Mobile" value={form.phone} onInput={(e) => setForm({ ...form, phone: e.currentTarget.value })} />}
                    {isVan && (
                      <s-select label="Driver" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.currentTarget.value })}>{driverOptions}</s-select>
                    )}
                    {isVan && (
                      <s-select label="Co-Driver" value={form.coDriverId} onChange={(e) => setForm({ ...form, coDriverId: e.currentTarget.value })}>{driverOptions}</s-select>
                    )}
                  </s-grid>
                  {isVan && drivers.length === 0 && <s-text color="subdued">No drivers yet. Add them on the <s-link href="/driver-management">Driver Management</s-link> page first.</s-text>}
                  <s-stack direction="inline" gap="base">
                    <s-button variant="primary" disabled={!form.name.trim() || busy || undefined} loading={busy || undefined} onClick={save}>{form.id ? 'Save' : 'Add'}</s-button>
                    <s-button onClick={() => setForm(null)}>Cancel</s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            )}

            {rows.length === 0 ? (
              <EmptyState title={`No ${kind}s yet`} hint={canEdit ? 'Press ADD NEW to add the first one.' : 'A manager with the Van Management permission can add them.'} />
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header>
                    <s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allTicked} onChange={(e) => setTicked(e.currentTarget.checked ? rows.map((r) => r.id) : [])} />
                  </s-table-header>
                  <s-table-header>ID</s-table-header>
                  <s-table-header listSlot="primary">{title} Name</s-table-header>
                  {isVan ? (
                    <>
                      <s-table-header>Driver Name</s-table-header>
                      <s-table-header>Driver Mobile</s-table-header>
                      <s-table-header>Co-Driver Name</s-table-header>
                      <s-table-header>Co-Driver Mobile</s-table-header>
                    </>
                  ) : <s-table-header>Mobile</s-table-header>}
                  <s-table-header>Status</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {rows.map((r, i) => {
                    const dr = isVan ? find(drivers, r.driverId) : null;
                    const co = isVan ? find(drivers, r.coDriverId) : null;
                    return (
                      <s-table-row key={r.id}>
                        <s-table-cell><s-checkbox label={`Select ${r.name}`} labelAccessibilityVisibility="exclusive" checked={ticked.includes(r.id)} onChange={(e) => toggle(r.id, e.currentTarget.checked)} /></s-table-cell>
                        <s-table-cell>{i + 1}</s-table-cell>
                        <s-table-cell>{canEdit ? <s-link onClick={() => edit(r)}>{r.name}</s-link> : r.name}</s-table-cell>
                        {isVan ? (
                          <>
                            <s-table-cell>{dr?.name ?? '-'}</s-table-cell>
                            <s-table-cell>{dr?.extra || '-'}</s-table-cell>
                            <s-table-cell>{co?.name ?? '-'}</s-table-cell>
                            <s-table-cell>{co?.extra || '-'}</s-table-cell>
                          </>
                        ) : <s-table-cell>{r.extra || '-'}</s-table-cell>}
                        <s-table-cell><s-badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</s-badge></s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            )}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}
