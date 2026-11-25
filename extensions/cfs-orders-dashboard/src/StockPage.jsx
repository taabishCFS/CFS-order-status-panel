import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import EmptyState from './EmptyState.jsx';
import { useStaff } from './useStaff';
import Pager from './Pager.jsx';
import { rangeText } from './orderList';
import { VIEW_OPTIONS, addFreeStock, deleteFreeStock, editFrom, emptyInput, inputProblem, loadFreeStock, updateFreeStock } from './freeStock';
import { MAX_IMPORT_BYTES, importFreeStock, importSummary, parseFreeStockCsv } from './freeStockImport';
import { loadReportLink } from './reports';

const PAGE_SIZE = 50;

// Stock: free stock is what we already own (cancelled or returned goods and the like) and can give to an order instead of buying again.
// This screen keeps the list. Giving stock to an order comes next.
export default function StockPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('available');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyInput());
  const [editing, setEditing] = useState(null); // { id, form } for the card being corrected
  const [deleting, setDeleting] = useState(null); // id of the card waiting for "Yes, delete"
  const staff = useStaff(); // undefined while checking, null when nobody can be verified
  const dropZone = useRef(null);
  const timer = useRef(null);

  const load = useCallback(async (next = {}) => {
    const q = { search, view, type, group: 'free', page, ...next };
    const res = await loadFreeStock(q);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [search, view, type, page]);

  // Reload when the view, type or page changes straight away; typing in the search waits a moment.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer.current);
  }, [load, search]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.currentTarget.value }));

  async function add() {
    const problem = inputProblem(form);
    if (problem) { setNotice({ tone: 'critical', text: problem }); return; }
    setBusy('add');
    const res = await addFreeStock(form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Added ${form.qty} x ${form.productCode} (${form.brand}).` });
    setForm(emptyInput());
    setView('available');
    setPage(1);
    load({ view: 'available', page: 1 });
  }

  const setEdit = (name) => (e) => setEditing((c) => ({ ...c, form: { ...c.form, [name]: e.currentTarget.value } }));

  async function saveEdit() {
    const problem = inputProblem(editing.form, 0);
    if (problem) { setNotice({ tone: 'critical', text: problem }); return; }
    setBusy(editing.id);
    const res = await updateFreeStock(editing.id, editing.form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Saved ${editing.form.productCode} (${editing.form.brand}).` });
    setEditing(null);
    load();
  }

  async function remove(it) {
    setBusy(it.id);
    const res = await deleteFreeStock(it.id);
    setBusy(null);
    setDeleting(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Deleted ${it.productCode} (${it.brand}).` });
    load();
  }

  async function download(kind, text) {
    setBusy(kind);
    const res = await loadReportLink(kind, null);
    setBusy(null);
    setNotice(res.ok ? { tone: 'success', text, link: res.data } : { tone: 'critical', text: res.message });
  }

  async function importFile(event) {
    const zone = event.currentTarget;
    const file = zone.files?.[0];
    if (!file) return;
    setProblems([]);
    const clear = () => { try { zone.value = ''; } catch { /* the zone may already be gone */ } };
    if (file.size > MAX_IMPORT_BYTES) { setNotice({ tone: 'critical', text: 'That file is too big. Save the stock list as CSV and try again.' }); clear(); return; }
    setBusy('import');
    try {
      const parsed = parseFreeStockCsv(await file.text());
      if (!parsed.ok) { setNotice({ tone: 'critical', text: parsed.message }); return; }
      const res = await importFreeStock(parsed.rows);
      if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
      setNotice({ tone: res.result.rejectedCount ? 'warning' : 'success', text: importSummary(res.result) });
      setProblems(res.result.rejected);
      setView('available');
      setPage(1);
      await load({ view: 'available', page: 1 });
    } catch {
      setNotice({ tone: 'critical', text: 'That file could not be read. Save it as CSV (comma separated) and try again.' });
    } finally {
      setBusy(null);
      clear();
    }
  }

  const items = data?.items ?? [];
  const canWrite = Boolean(staff);

  return (
    <s-page heading="Stock">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/">Orders</s-button>

      {error && <s-banner tone="critical" heading="Could not load the stock">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing stock needs a verified Shopify staff sign-in.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.link && <s-link href={notice.link.url} target="_blank">Download {notice.link.filename}</s-link>}
        </s-banner>
      )}
      {problems.length > 0 && (
        <s-banner tone="warning" heading="These rows were skipped. Fix them and import again.">
          <s-stack gap="small-200">
            {problems.slice(0, 10).map((p, i) => <s-text key={i}>{p.line ? `Row ${p.line}: ` : ''}{p.reason}</s-text>)}
            {problems.length > 10 && <s-text color="subdued">...and more.</s-text>}
          </s-stack>
        </s-banner>
      )}

      <s-section heading="Add free stock">
        <s-stack gap="base">
          <s-text>Free stock is goods we already own, such as a cancelled or returned order. Add what we hold so it can be given to another order.</s-text>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <s-text-field label="Brand" value={form.brand} onInput={set('brand')} />
            <s-text-field label="Product code" value={form.productCode} onInput={set('productCode')} />
            <s-text-field label="Product name" value={form.productName} onInput={set('productName')} />
            <s-text-field label="Quantity" value={form.qty} onInput={set('qty')} />
            <s-text-field label="Cost each (optional)" value={form.cost} onInput={set('cost')} />
            <s-text-field label="Source order no. (optional)" value={form.sourceOrder} onInput={set('sourceOrder')} />
          </s-grid>
          <s-text-field label="Remarks (optional)" value={form.remarks} onInput={set('remarks')} />
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={add} disabled={!canWrite || busy === 'add' || undefined} loading={busy === 'add' || undefined}>Add to stock</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Fill in many items from a spreadsheet">
        <s-stack gap="base">
          <s-text>1. Download the sample. 2. Open it in Excel and replace the example row with your stock. 3. Save it as CSV and drop it below.</s-text>
          <s-text color="subdued">Importing adds new rows every time, so do not import a list you downloaded from here. Brand, Qty and Product Code are needed on every row; the other columns can stay blank.</s-text>
          <s-stack direction="inline" gap="base">
            <s-button onClick={() => download('freestocksample', 'The sample is ready (the link works for 5 minutes).')} loading={busy === 'freestocksample' || undefined}>Download sample (CSV)</s-button>
            <s-button onClick={() => download('freestock', 'The stock list is ready (the link works for 5 minutes).')} loading={busy === 'freestock' || undefined}>Download stock list (CSV)</s-button>
          </s-stack>
          <s-drop-zone ref={dropZone} label="Import free stock (CSV)" accept=".csv" disabled={!canWrite || busy === 'import' || undefined} onChange={importFile} />
          {busy === 'import' && <s-text color="subdued">Importing...</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Free stock">
        <s-stack gap="base">
          <s-search-field label="Search stock" placeholder="Brand, product, code, order no. or warehouse code" value={search} onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }} />
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Show" value={view} onChange={(e) => { setView(e.currentTarget.value); setPage(1); }}>
              {VIEW_OPTIONS.map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
            </s-select>
            {(data?.itemTypes?.length ?? 0) > 1 && (
              <s-select label="Type" value={type} onChange={(e) => { setType(e.currentTarget.value); setPage(1); }}>
                <s-option value="">All types</s-option>
                {data.itemTypes.map((t) => <s-option key={t} value={t}>{t}</s-option>)}
              </s-select>
            )}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data === null ? 'Loading...' : rangeText(data.page, PAGE_SIZE, data.total, false)}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={setPage} />}
          </s-stack>
          {data && items.length === 0 && <EmptyState title="Nothing to show" hint={search.trim() ? 'Nothing matches that search.' : view === 'available' ? 'No free stock yet. Add some above.' : 'Nothing to show.'} />}
          {items.map((it) => (editing?.id === it.id ? (
            <s-box key={it.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack gap="base">
                <s-text type="strong">Correct this item</s-text>
                <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
                  <s-text-field label="Brand" value={editing.form.brand} onInput={setEdit('brand')} />
                  <s-text-field label="Product code" value={editing.form.productCode} onInput={setEdit('productCode')} />
                  <s-text-field label="Product name" value={editing.form.productName} onInput={setEdit('productName')} />
                  <s-text-field label="Quantity in stock (0 = used up)" value={editing.form.qty} onInput={setEdit('qty')} />
                  <s-text-field label="Cost each" value={editing.form.cost} onInput={setEdit('cost')} />
                  <s-text-field label="Source order no." value={editing.form.sourceOrder} onInput={setEdit('sourceOrder')} />
                  <s-text-field label="Warehouse code" value={editing.form.warehouseCode} onInput={setEdit('warehouseCode')} />
                  <s-text-field label="RMA" value={editing.form.rma} onInput={setEdit('rma')} />
                  <s-text-field label="Item type" value={editing.form.itemType} onInput={setEdit('itemType')} />
                  <s-text-field label="Credit / FOC" value={editing.form.creditFoc} onInput={setEdit('creditFoc')} />
                  <s-text-field label="Status" value={editing.form.status} onInput={setEdit('status')} />
                  <s-text-field label="Collection" value={editing.form.collection} onInput={setEdit('collection')} />
                </s-grid>
                <s-text-field label="Remarks" value={editing.form.remarks} onInput={setEdit('remarks')} />
                <s-stack direction="inline" gap="base">
                  <s-button variant="primary" onClick={saveEdit} loading={busy === it.id || undefined}>Save changes</s-button>
                  <s-button onClick={() => setEditing(null)}>Cancel</s-button>
                </s-stack>
              </s-stack>
            </s-box>
          ) : (
            <s-box key={it.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-text type="strong">{it.productName}</s-text>
                  <s-badge tone={it.qty > 0 ? 'success' : 'neutral'}>{it.qty > 0 ? `${it.qty} in stock` : 'Used up'}</s-badge>
                </s-stack>
                <s-text color="subdued">{it.brand} · {it.productCode} · {it.warehouseCode}{it.cost ? ` · £${it.cost} each` : ''}</s-text>
                {(it.sourceOrder || it.rma || it.remarks) && (
                  <s-text color="subdued">{[it.sourceOrder && `From order ${it.sourceOrder}`, it.rma && `RMA ${it.rma}`, it.remarks].filter(Boolean).join(' · ')}</s-text>
                )}
                {it.allocatedTo?.length > 0 && <s-text color="subdued">Given to: {it.allocatedTo.join(', ')}</s-text>}
                {deleting === it.id ? (
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text>Delete this item for good?</s-text>
                    <s-button tone="critical" onClick={() => remove(it)} loading={busy === it.id || undefined}>Yes, delete</s-button>
                    <s-button onClick={() => setDeleting(null)}>Cancel</s-button>
                  </s-stack>
                ) : (
                  <s-stack direction="inline" gap="small-200">
                    <s-button disabled={!canWrite || undefined} onClick={() => { setDeleting(null); setEditing({ id: it.id, form: editFrom(it) }); }}>Edit</s-button>
                    <s-button tone="critical" disabled={!canWrite || undefined} onClick={() => { setEditing(null); setDeleting(it.id); }}>Delete</s-button>
                  </s-stack>
                )}
              </s-stack>
            </s-box>
          )))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
