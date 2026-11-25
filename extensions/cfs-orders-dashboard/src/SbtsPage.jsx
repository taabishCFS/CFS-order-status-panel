import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import EmptyState from './EmptyState.jsx';
import { useStaff } from './useStaff';
import Pager from './Pager.jsx';
import { rangeText } from './orderList';
import { SBTS_TYPES, VIEW_OPTIONS, addFreeStock, emptyInput, inputProblem, loadFreeStock, markCollected, removeMany, removedText, typeLabel } from './freeStock';
import { loadReportLink } from './reports';

const PAGE_SIZE = 50;

// SBTS / Display: goods that are not free stock. "Send Back To Supplier" items are cancelled or returned goods we can send back to the supplier;
// "Display" items are showroom pieces. Staff tick items to mark them collected by the supplier, or to remove them.
export default function SbtsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('available');
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ ...emptyInput(), itemType: 'SBTS' });
  const [picked, setPicked] = useState([]); // ids of the ticked items
  const [confirmRemove, setConfirmRemove] = useState(false);
  const staff = useStaff();
  const timer = useRef(null);

  const load = useCallback(async (next = {}) => {
    const res = await loadFreeStock({ search, view, type, brand, group: 'other', page, ...next });
    if (res.ok) { setData(res.data); setError(null); setPicked([]); setConfirmRemove(false); } else setError(res.message);
  }, [search, view, type, brand, page]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer.current);
  }, [load, search]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.currentTarget.value }));
  const items = data?.items ?? [];
  const canWrite = Boolean(staff);
  const allPicked = items.length > 0 && picked.length === items.length;
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function add() {
    const problem = inputProblem(form);
    if (problem) { setNotice({ tone: 'critical', text: problem }); return; }
    setBusy('add');
    const res = await addFreeStock(form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Added ${form.qty} x ${form.productCode} (${typeLabel(form.itemType)}).` });
    setForm({ ...emptyInput(), itemType: form.itemType });
    setView('available');
    setPage(1);
    load({ view: 'available', page: 1 });
  }

  async function collect(flag) {
    setBusy(flag ? 'collect' : 'uncollect');
    const res = await markCollected(picked, flag);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: flag ? `Marked ${res.changed} item${res.changed === 1 ? '' : 's'} collected.` : `Removed ${res.changed} item${res.changed === 1 ? '' : 's'} from collected.` });
    load();
  }

  async function remove() {
    setBusy('remove');
    const res = await removeMany(picked);
    setBusy(null);
    setConfirmRemove(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: res.kept ? 'warning' : 'success', text: removedText(res.removed, res.kept) });
    load();
  }

  async function download() {
    setBusy('download');
    const res = await loadReportLink('sbtsstock', null);
    setBusy(null);
    setNotice(res.ok ? { tone: 'success', text: 'The list is ready (the link works for 5 minutes).', link: res.data } : { tone: 'critical', text: res.message });
  }

  return (
    <s-page heading="SBTS / Display">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/stock">Stock</s-button>
      <s-button slot="secondary-actions" href="/">Orders</s-button>

      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing this list needs a verified Shopify staff sign-in.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.link && <s-link href={notice.link.url} target="_blank">Download {notice.link.filename}</s-link>}
        </s-banner>
      )}

      <s-section heading="Add an item">
        <s-stack gap="base">
          <s-text>Send Back To Supplier items are cancelled or returned goods we can send back to the supplier. Display items are showroom pieces.</s-text>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <s-select label="Type" value={form.itemType} onChange={set('itemType')}>
              {SBTS_TYPES.map((t) => <s-option key={t.value} value={t.value}>{t.label}</s-option>)}
            </s-select>
            <s-text-field label="Brand" value={form.brand} onInput={set('brand')} />
            <s-text-field label="Product code" value={form.productCode} onInput={set('productCode')} />
            <s-text-field label="Product name" value={form.productName} onInput={set('productName')} />
            <s-text-field label="Quantity" value={form.qty} onInput={set('qty')} />
            <s-text-field label="Cost each (optional)" value={form.cost} onInput={set('cost')} />
            <s-text-field label="Source order no. (optional)" value={form.sourceOrder} onInput={set('sourceOrder')} />
          </s-grid>
          <s-text-field label="Remarks (optional)" value={form.remarks} onInput={set('remarks')} />
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={add} disabled={!canWrite || busy === 'add' || undefined} loading={busy === 'add' || undefined}>Add item</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="SBTS / Display items">
        <s-stack gap="base">
          <s-search-field label="Search" placeholder="Brand, product, code, order no., RMA or warehouse code" value={search} onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }} />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <s-select label="Brand" value={brand} onChange={(e) => { setBrand(e.currentTarget.value); setPage(1); }}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-select label="Type" value={type} onChange={(e) => { setType(e.currentTarget.value); setPage(1); }}>
              <s-option value="">All types</s-option>
              {SBTS_TYPES.map((t) => <s-option key={t.value} value={t.value}>{t.label}</s-option>)}
            </s-select>
            <s-select label="Show" value={view} onChange={(e) => { setView(e.currentTarget.value); setPage(1); }}>
              {VIEW_OPTIONS.map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
            </s-select>
          </s-grid>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data === null ? 'Loading...' : rangeText(data.page, PAGE_SIZE, data.total, false)}</s-text>
            <s-button onClick={download} loading={busy === 'download' || undefined}>Download list (CSV)</s-button>
          </s-stack>
          {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={setPage} />}

          {items.length > 0 && (
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-checkbox label="Select all on this page" checked={allPicked} onChange={() => setPicked(allPicked ? [] : items.map((i) => i.id))} />
              <s-text color="subdued">{picked.length} ticked</s-text>
              <s-button disabled={!canWrite || picked.length === 0 || busy !== null || undefined} loading={busy === 'collect' || undefined} onClick={() => collect(true)}>Mark collected</s-button>
              <s-button disabled={!canWrite || picked.length === 0 || busy !== null || undefined} loading={busy === 'uncollect' || undefined} onClick={() => collect(false)}>Remove from collected</s-button>
              {confirmRemove ? (
                <>
                  <s-text>Remove {picked.length} item{picked.length === 1 ? '' : 's'} for good?</s-text>
                  <s-button tone="critical" loading={busy === 'remove' || undefined} onClick={remove}>Yes, remove</s-button>
                  <s-button onClick={() => setConfirmRemove(false)}>Cancel</s-button>
                </>
              ) : (
                <s-button tone="critical" disabled={!canWrite || picked.length === 0 || busy !== null || undefined} onClick={() => setConfirmRemove(true)}>Remove</s-button>
              )}
            </s-stack>
          )}

          {data && items.length === 0 && <EmptyState title="Nothing to show" hint={search.trim() || brand || type ? 'Nothing matches those filters.' : view === 'available' ? 'No SBTS or display items yet. Add some above.' : 'Nothing to show.'} />}
          {items.map((it) => (
            <s-box key={it.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-checkbox label={it.productName} checked={picked.includes(it.id)} onChange={() => toggle(it.id)} />
                  <s-stack direction="inline" gap="small-200">
                    <s-badge tone="info">{typeLabel(it.itemType)}</s-badge>
                    {it.collected && <s-badge tone="success">Collected</s-badge>}
                    <s-badge tone={it.qty > 0 ? 'success' : 'neutral'}>{it.qty > 0 ? `${it.qty} in stock` : 'Used up'}</s-badge>
                  </s-stack>
                </s-stack>
                <s-text color="subdued">{it.brand} · {it.productCode} · {it.warehouseCode}{it.cost ? ` · £${it.cost} each` : ''}</s-text>
                {(it.sourceOrder || it.rma || it.remarks) && (
                  <s-text color="subdued">{[it.sourceOrder && `From order ${it.sourceOrder}`, it.rma && `RMA ${it.rma}`, it.remarks].filter(Boolean).join(' · ')}</s-text>
                )}
                {it.allocatedTo?.length > 0 && <s-text color="subdued">Given to: {it.allocatedTo.join(', ')}</s-text>}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
