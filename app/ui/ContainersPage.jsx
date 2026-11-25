import { useCallback, useEffect, useRef, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import { useStaff } from './useStaff';
import Pager from './Pager.jsx';
import { rangeText } from './orderList';
import { VIEW_OPTIONS, addContainer, addFreight, containerProblem, deleteContainer, editFrom, emptyContainer, freightText, importContainers, importSummary, loadContainers, parseContainerCsv, updateContainer, MAX_IMPORT_BYTES } from './containers';
import { loadReportLink } from './reports';

const PAGE_SIZE = 50;

// Containers: stock arriving from vendors in containers, with the expected date, and the freight paid per container.
// Container stock is given to an order from the order's own page, like free stock.
export default function ContainersPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('available');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyContainer());
  const [freight, setFreight] = useState({ itemVendor: '', containerNo: '', amount: '' });
  const [editing, setEditing] = useState(null); // { id, form }
  const [deleting, setDeleting] = useState(null);
  const staff = useStaff();
  const dropZone = useRef(null);
  const timer = useRef(null);

  const load = useCallback(async (next = {}) => {
    const res = await loadContainers({ search, view, page, ...next });
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [search, view, page]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer.current);
  }, [load, search]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.currentTarget.value }));
  const setEdit = (name) => (e) => setEditing((c) => ({ ...c, form: { ...c.form, [name]: e.currentTarget.value } }));

  async function add() {
    const problem = containerProblem(form);
    if (problem) { setNotice({ tone: 'critical', text: problem }); return; }
    setBusy('add');
    const res = await addContainer(form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Added ${form.qty} x ${form.productCode} (container ${form.containerNo}).` });
    setForm(emptyContainer());
    setView('available');
    setPage(1);
    load({ view: 'available', page: 1 });
  }

  async function saveEdit() {
    const problem = containerProblem(editing.form, 0);
    if (problem) { setNotice({ tone: 'critical', text: problem }); return; }
    setBusy(editing.id);
    const res = await updateContainer(editing.id, editing.form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Saved ${editing.form.productCode} (container ${editing.form.containerNo}).` });
    setEditing(null);
    load();
  }

  async function remove(it) {
    setBusy(it.id);
    const res = await deleteContainer(it.id);
    setBusy(null);
    setDeleting(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Deleted ${it.productCode} (container ${it.containerNo}).` });
    load();
  }

  async function saveFreight() {
    if (!freight.itemVendor.trim() || !freight.containerNo.trim()) { setNotice({ tone: 'critical', text: 'Enter the vendor and the container number.' }); return; }
    if (!/^[£\s]*\d[\d,]*(\.\d{1,2})?\s*$/.test(freight.amount)) { setNotice({ tone: 'critical', text: 'The freight must be an amount like 850.00.' }); return; }
    setBusy('freight');
    const res = await addFreight(freight.itemVendor, freight.containerNo, freight.amount);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Recorded £${freight.amount.replace(/[£\s]/g, '')} freight for container ${freight.containerNo}.` });
    setFreight({ itemVendor: '', containerNo: '', amount: '' });
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
    if (file.size > MAX_IMPORT_BYTES) { setNotice({ tone: 'critical', text: 'That file is too big. Save the container list as CSV and try again.' }); clear(); return; }
    setBusy('import');
    try {
      const parsed = parseContainerCsv(await file.text());
      if (!parsed.ok) { setNotice({ tone: 'critical', text: parsed.message }); return; }
      const res = await importContainers(parsed.rows);
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
    <s-page heading="Containers">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/stock">Stock</s-button>
      <s-button slot="secondary-actions" href="/">Orders</s-button>

      {error && <s-banner tone="critical" heading="Could not load the containers">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing container stock needs a verified Shopify staff sign-in.</s-banner>}
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

      <s-section heading="Add a container item">
        <s-stack gap="base">
          <s-text>Goods coming from a vendor in a container. Give each item the date the container is expected; until then it shows as on the water.</s-text>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <s-text-field label="Item vendor" value={form.itemVendor} onInput={set('itemVendor')} />
            <s-text-field label="Container no." value={form.containerNo} onInput={set('containerNo')} />
            <s-text-field label="Product code" value={form.productCode} onInput={set('productCode')} />
            <s-text-field label="Product name" value={form.productName} onInput={set('productName')} />
            <s-text-field label="Quantity" value={form.qty} onInput={set('qty')} />
            <s-text-field label="Expected date (e.g. 31/12/2026)" value={form.expectedDate} onInput={set('expectedDate')} />
            <s-text-field label="Cost in dollars each (optional)" value={form.costDollar} onInput={set('costDollar')} />
            <s-text-field label="Price each (optional)" value={form.price} onInput={set('price')} />
            <s-text-field label="Delivery cost (optional)" value={form.delvCost} onInput={set('delvCost')} />
            <s-text-field label="Total CBM (optional)" value={form.totalCbm} onInput={set('totalCbm')} />
          </s-grid>
          <s-text color="subdued">The cost in pounds is worked out from the dollar cost at 0.81, as the old system did.</s-text>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={add} disabled={!canWrite || busy === 'add' || undefined} loading={busy === 'add' || undefined}>Add to containers</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Fill in many items from a spreadsheet">
        <s-stack gap="base">
          <s-text>1. Download the sample. 2. Open it in Excel and replace the example row with your container list. 3. Save it as CSV and drop it below.</s-text>
          <s-text color="subdued">Importing adds new rows every time, so do not import a list you downloaded from here. Item Vendor, Container No, Product Code and a quantity are needed on every row. Dates are day first, like 31/12/2026.</s-text>
          <s-stack direction="inline" gap="base">
            <s-button onClick={() => download('containersample', 'The sample is ready (the link works for 5 minutes).')} loading={busy === 'containersample' || undefined}>Download sample (CSV)</s-button>
            <s-button onClick={() => download('containers', 'The container list is ready (the link works for 5 minutes).')} loading={busy === 'containers' || undefined}>Download container list (CSV)</s-button>
          </s-stack>
          <s-drop-zone ref={dropZone} label="Import containers (CSV)" accept=".csv" disabled={!canWrite || busy === 'import' || undefined} onChange={importFile} />
          {busy === 'import' && <s-text color="subdued">Importing...</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Freight">
        <s-stack gap="base">
          <s-text>Record what was paid to ship a container. Payments for the same vendor and container add up. The freight is shown beside each item in that container; it is not shared out between items.</s-text>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <s-text-field label="Item vendor" value={freight.itemVendor} onInput={(e) => setFreight((f) => ({ ...f, itemVendor: e.currentTarget.value }))} />
            <s-text-field label="Container no." value={freight.containerNo} onInput={(e) => setFreight((f) => ({ ...f, containerNo: e.currentTarget.value }))} />
            <s-text-field label="Freight paid (£)" value={freight.amount} onInput={(e) => setFreight((f) => ({ ...f, amount: e.currentTarget.value }))} />
          </s-grid>
          <s-stack direction="inline" gap="base">
            <s-button onClick={saveFreight} disabled={!canWrite || busy === 'freight' || undefined} loading={busy === 'freight' || undefined}>Record freight</s-button>
          </s-stack>
          {(data?.freight ?? []).map((f) => <s-text key={`${f.itemVendor}|${f.containerNo}`} color="subdued">{freightText(f)}</s-text>)}
        </s-stack>
      </s-section>

      <s-section heading="Container stock">
        <s-stack gap="base">
          <s-search-field label="Search containers" placeholder="Vendor, container no., product, code or warehouse code" value={search} onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }} />
          <s-select label="Show" value={view} onChange={(e) => { setView(e.currentTarget.value); setPage(1); }}>
            {VIEW_OPTIONS.map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
          </s-select>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data === null ? 'Loading...' : rangeText(data.page, PAGE_SIZE, data.total, false)}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={setPage} />}
          </s-stack>
          {data && items.length === 0 && <EmptyState title="Nothing to show" hint={search.trim() ? 'Nothing matches that search.' : view === 'available' ? 'No container stock yet. Add some above.' : 'Nothing to show.'} />}
          {items.map((it) => (editing?.id === it.id ? (
            <s-box key={it.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack gap="base">
                <s-text type="strong">Correct this item</s-text>
                <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
                  <s-text-field label="Item vendor" value={editing.form.itemVendor} onInput={setEdit('itemVendor')} />
                  <s-text-field label="Container no." value={editing.form.containerNo} onInput={setEdit('containerNo')} />
                  <s-text-field label="Product code" value={editing.form.productCode} onInput={setEdit('productCode')} />
                  <s-text-field label="Product name" value={editing.form.productName} onInput={setEdit('productName')} />
                  <s-text-field label="Quantity left (0 = used up)" value={editing.form.qty} onInput={setEdit('qty')} />
                  <s-text-field label="Quantity that arrived" value={editing.form.addedQty} onInput={setEdit('addedQty')} />
                  <s-text-field label="Expected date" value={editing.form.expectedDate} onInput={setEdit('expectedDate')} />
                  <s-text-field label="Cost in dollars each" value={editing.form.costDollar} onInput={setEdit('costDollar')} />
                  <s-text-field label="Price each" value={editing.form.price} onInput={setEdit('price')} />
                  <s-text-field label="Delivery cost" value={editing.form.delvCost} onInput={setEdit('delvCost')} />
                  <s-text-field label="Total CBM" value={editing.form.totalCbm} onInput={setEdit('totalCbm')} />
                  <s-text-field label="Warehouse code" value={editing.form.warehouseCode} onInput={setEdit('warehouseCode')} />
                  <s-text-field label="SKU" value={editing.form.sku} onInput={setEdit('sku')} />
                  <s-text-field label="Container range" value={editing.form.containerRange} onInput={setEdit('containerRange')} />
                </s-grid>
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
                  <s-stack direction="inline" gap="small-200">
                    {it.qty > 0 && it.expectedDate && <s-badge tone={it.onWater ? 'warning' : 'info'}>{it.onWater ? `On the water, due ${it.expectedDate}` : `Arrived ${it.expectedDate}`}</s-badge>}
                    <s-badge tone={it.qty > 0 ? 'success' : 'neutral'}>{it.qty > 0 ? `${it.qty} of ${it.addedQty} left` : 'Used up'}</s-badge>
                  </s-stack>
                </s-stack>
                <s-text color="subdued">{it.itemVendor} · container {it.containerNo} · {it.productCode} · {it.warehouseCode}</s-text>
                <s-text color="subdued">{[it.cost && `£${it.cost} each (from $${it.costDollar})`, it.price && `price £${it.price}`, it.delvCost && `delivery £${it.delvCost}`, it.totalCbm && `${it.totalCbm} CBM`, it.freight && `freight paid on this container £${it.freight}`].filter(Boolean).join(' · ') || 'No costs recorded.'}</s-text>
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
