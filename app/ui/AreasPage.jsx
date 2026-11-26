import { useCallback, useEffect, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { useStaff } from './useStaff';
import { addArea, deleteAreas, loadAreas, setAreasStatus, updateArea } from './areas';

const BLANK = { id: null, name: '', postcodes: '', active: true };

// Area: named groups of postcode beginnings (for example "NE, DH, SR"), added, edited, switched on and off, or deleted.
export default function AreasPage() {
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null); // null = hidden, else the area being added or edited
  const [ticked, setTicked] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(null); // 'save' | 'active' | 'inactive' | 'delete'
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadAreas(page);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allTicked = rows.length > 0 && rows.every((r) => ticked.includes(r.id));
  const canEdit = !!staff;
  const toggle = (id, on) => setTicked((t) => (on ? [...new Set([...t, id])] : t.filter((x) => x !== id)));
  const needTick = () => { setNotice({ tone: 'warning', text: 'Please Select Record(s) first.' }); };

  async function save() {
    if (!form.name.trim()) { setNotice({ tone: 'warning', text: 'Enter the Area name.' }); return; }
    setBusy('save');
    const res = form.id ? await updateArea(form) : await addArea(form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: res.message.startsWith('Error') ? 'critical' : 'warning', text: res.message }); return; }
    setNotice({ tone: 'success', text: form.id ? 'Record Updated.' : 'Record Added.' });
    setForm(null);
    await load();
  }

  async function setStatus(active) {
    if (ticked.length === 0) { needTick(); return; }
    setBusy(active ? 'active' : 'inactive');
    const res = await setAreasStatus(ticked, active);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `${res.data.changed ?? ticked.length} area${(res.data.changed ?? ticked.length) === 1 ? '' : 's'} made ${active ? 'Active' : 'Inactive'}.` });
    setTicked([]);
    await load();
  }

  async function remove() {
    setBusy('delete');
    const res = await deleteAreas(ticked);
    setBusy(null);
    setConfirming(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Deleted ${res.data.deleted ?? ticked.length} record${(res.data.deleted ?? ticked.length) === 1 ? '' : 's'}.` });
    setTicked([]);
    await load();
  }

  return (
    <s-page heading={`Area${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/van-management">Van Management</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing areas needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `Showing ${data.total === 0 ? 0 : (data.page - 1) * 50 + 1} - ${Math.min(data.page * 50, data.total)} Records Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={setPage} />}
          </s-stack>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" disabled={!canEdit || busy || undefined} onClick={() => setForm({ ...BLANK })}>Add new</s-button>
            <s-button disabled={!canEdit || busy || undefined} loading={busy === 'inactive' || undefined} onClick={() => setStatus(false)}>Inactive</s-button>
            <s-button disabled={!canEdit || busy || undefined} loading={busy === 'active' || undefined} onClick={() => setStatus(true)}>Active</s-button>
            <s-button tone="critical" disabled={!canEdit || busy || undefined} onClick={() => (ticked.length ? setConfirming(true) : needTick())}>Delete</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {form && (
        <s-section heading={form.id ? 'Update Area' : 'Add Area'}>
          <s-stack gap="base">
            <s-text-field label="Area" value={form.name} onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} />
            <s-text-area label="Postcodes" details="Postcode beginnings separated by commas, for example NE, DH, SR. An order matches when its postcode starts with one of them." rows={3} value={form.postcodes} onInput={(e) => setForm({ ...form, postcodes: e.currentTarget.value })} />
            <s-select label="Status" value={form.active ? 'Active' : 'Inactive'} onChange={(e) => setForm({ ...form, active: e.currentTarget.value === 'Active' })}>
              <s-option value="Active">Active</s-option>
              <s-option value="Inactive">Inactive</s-option>
            </s-select>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" disabled={busy || undefined} loading={busy === 'save' || undefined} onClick={save}>{form.id ? 'Update' : 'Add'}</s-button>
              <s-button disabled={busy || undefined} onClick={() => setForm(null)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {confirming && (
        <s-banner tone="critical" heading={`Delete ${ticked.length} area${ticked.length === 1 ? '' : 's'}?`}>
          <s-stack direction="inline" gap="base">
            <s-text>This cannot be undone.</s-text>
            <s-button tone="critical" disabled={busy || undefined} loading={busy === 'delete' || undefined} onClick={remove}>Yes, delete</s-button>
            <s-button disabled={busy || undefined} onClick={() => setConfirming(false)}>Cancel</s-button>
          </s-stack>
        </s-banner>
      )}

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No areas yet" hint="Press Add new to create the first one." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allTicked} onChange={(e) => setTicked(e.currentTarget.checked ? rows.map((r) => r.id) : [])} /></s-table-header>
              <s-table-header listSlot="primary">ID</s-table-header>
              <s-table-header>Area</s-table-header>
              <s-table-header>Postcodes</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell><s-checkbox label={`Select ${r.name}`} labelAccessibilityVisibility="exclusive" checked={ticked.includes(r.id)} onChange={(e) => toggle(r.id, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{r.number}</s-table-cell>
                  <s-table-cell>{canEdit ? <s-link onClick={() => setForm({ id: r.id, name: r.name, postcodes: r.postcodes, active: r.active })}>{r.name}</s-link> : r.name}</s-table-cell>
                  <s-table-cell>{r.postcodes || '—'}</s-table-cell>
                  <s-table-cell><s-badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</s-badge></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
