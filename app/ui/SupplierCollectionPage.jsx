import { useCallback, useEffect, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { useStaff } from './useStaff';
import { addCollection, deleteCollections, loadCollections } from './supplierCollection';

const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const START = { brand: '', vanId: '', date: '' };

// Supplier Collection: plan a pick-up from a supplier (brand + van + day) and remove ones no longer needed.
export default function SupplierCollectionPage() {
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(START);
  const [ticked, setTicked] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(null); // 'book' | 'delete'
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false); // so only Refresh spins when it is pressed, not on other reloads

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadCollections(page);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allTicked = rows.length > 0 && rows.every((r) => ticked.includes(r.id));
  const canEdit = !!staff;
  const toggle = (id, on) => setTicked((t) => (on ? [...new Set([...t, id])] : t.filter((x) => x !== id)));

  async function book() {
    if (!form.brand) { setNotice({ tone: 'warning', text: 'Select Brand.' }); return; }
    if (!form.vanId) { setNotice({ tone: 'warning', text: 'Select VAN.' }); return; }
    if (!form.date) { setNotice({ tone: 'warning', text: 'Select Date.' }); return; }
    setBusy('book');
    const res = await addCollection(form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: res.message.startsWith('Error') ? 'critical' : 'warning', text: res.message }); return; }
    setNotice({ tone: 'success', text: 'Record Added.' });
    setForm(START);
    if (page !== 1) setPage(1); else await load();
  }

  async function remove() {
    setBusy('delete');
    const res = await deleteCollections(ticked);
    setBusy(null);
    setConfirming(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Deleted ${res.data.deleted ?? ticked.length} record${(res.data.deleted ?? ticked.length) === 1 ? '' : 's'}.` });
    setTicked([]);
    await load();
  }

  return (
    <s-page heading={`Supplier Collection${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/suppliers">Suppliers</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing the list needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `Showing ${data.total === 0 ? 0 : (data.page - 1) * 50 + 1} - ${Math.min(data.page * 50, data.total)} Records Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={setPage} />}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.currentTarget.value })}>
              <s-option value="">Select Brand</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-select label="Van" value={form.vanId} onChange={(e) => setForm({ ...form, vanId: e.currentTarget.value })}>
              <s-option value="">Select VAN</s-option>
              {(data?.vans ?? []).map((v) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
            </s-select>
            <s-date-field label="Date" value={form.date} onChange={(e) => setForm({ ...form, date: e.currentTarget.value })} />
            <s-button variant="primary" disabled={!canEdit || busy || undefined} loading={busy === 'book' || undefined} onClick={book}>Book</s-button>
            <s-button tone="critical" disabled={!canEdit || ticked.length === 0 || busy || undefined} onClick={() => setConfirming(true)}>Delete selected ({ticked.length})</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {confirming && (
        <s-banner tone="critical" heading={`Delete ${ticked.length} record${ticked.length === 1 ? '' : 's'}?`}>
          <s-stack direction="inline" gap="base">
            <s-text>This cannot be undone.</s-text>
            <s-button tone="critical" disabled={busy || undefined} loading={busy === 'delete' || undefined} onClick={remove}>Yes, delete</s-button>
            <s-button disabled={busy || undefined} onClick={() => setConfirming(false)}>Cancel</s-button>
          </s-stack>
        </s-banner>
      )}

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No supplier collections yet" hint="Choose a brand, a van and a date, then press Book." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allTicked} onChange={(e) => setTicked(e.currentTarget.checked ? rows.map((r) => r.id) : [])} /></s-table-header>
              <s-table-header listSlot="primary">S.No.</s-table-header>
              <s-table-header>Supplier</s-table-header>
              <s-table-header>Address</s-table-header>
              <s-table-header>Van Info</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell><s-checkbox label={`Select ${r.brand} ${dmy(r.date)}`} labelAccessibilityVisibility="exclusive" checked={ticked.includes(r.id)} onChange={(e) => toggle(r.id, e.currentTarget.checked)} /></s-table-cell>
                  <s-table-cell>{r.number}</s-table-cell>
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{r.address || '—'}</s-table-cell>
                  <s-table-cell>{r.van}</s-table-cell>
                  <s-table-cell>{dmy(r.date)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
