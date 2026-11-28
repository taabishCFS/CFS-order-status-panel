import { useCallback, useEffect, useRef, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { addIssue, deletePhoto, issuesLink, loadIssues, saveIssue, uploadPhoto } from './serviceIssues';

const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const CHOICES = { chargeable: ['Chargeable', 'Non Chargeable'], status: ['Open', 'Closed'], mdTd: ['MD', 'TD'] };
const MONEY = new Set(['amount', 'cost', 'price', 'discount', 'finalPrice']);

// The table columns in the old page's order: [field, heading, kind, min width].
const COLUMNS = [
  ['raisedDate', 'Raised Date', 'date', '150px'],
  ['expectedDate', 'Exp. Date', 'date', '150px'],
  ['orderNo', 'Order No.', 'text', '100px'],
  ['brand', 'Brand', 'text', '130px'],
  ['item', 'Item', 'area', '220px'],
  ['code', 'Code', 'text', '120px'],
  ['remark', 'Remark', 'area', '240px'],
  ['qty', 'Qty', 'text', '60px'],
  ['process', 'Process', 'text', '110px'],
  ['chargeable', 'Chargeable?', 'select', '160px'],
  ['amount', 'Amount', 'text', '90px'],
  ['supplierOffered', 'Supplier Offered', 'text', '110px'],
  ['status', 'Status', 'select', '110px'],
  ['rma', 'RMA', 'text', '100px'],
  ['mdTd', 'MD/TD', 'select', '100px'],
  ['cost', 'Cost', 'text', '90px'],
  ['price', 'Price', 'text', '90px'],
  ['discount', 'Discount', 'text', '90px'],
  ['finalPrice', 'Final Price', 'text', '90px'],
  ['van', 'Van', 'text', '90px'],
  ['containerNo', 'Container No.', 'text', '120px'],
  ['takenBy', 'Name', 'text', '120px'],
];

// One editable cell. Dates and lists save when picked, text when the box is left; only this cell shows it is saving.
function Cell({ row, field, heading, kind, width, busy, onSave }) {
  const shown = row[field] === null || row[field] === undefined ? '' : String(row[field]);
  const [value, setValue] = useState(shown);
  useEffect(() => setValue(shown), [shown]);
  const saving = busy === `${row.id}:${field}`;
  const save = (v) => { if (v !== shown) onSave(row, field, v); };
  const common = { label: heading, labelAccessibilityVisibility: 'exclusive', value, disabled: saving || undefined };
  let control;
  if (kind === 'date') control = <s-date-field {...common} onChange={(e) => { setValue(e.currentTarget.value); save(e.currentTarget.value); }} />;
  else if (kind === 'select') {
    control = (
      <s-select {...common} onChange={(e) => { setValue(e.currentTarget.value); save(e.currentTarget.value); }}>
        <s-option value="">--</s-option>
        {CHOICES[field].map((o) => <s-option key={o} value={o}>{o}</s-option>)}
      </s-select>
    );
  } else {
    const Tag = kind === 'area' ? 's-text-area' : 's-text-field';
    control = <Tag {...common} onInput={(e) => setValue(e.currentTarget.value)} onChange={(e) => save(e.currentTarget.value.trim())} />;
  }
  return <s-box minInlineSize={width}>{control}</s-box>;
}

const BLANK = () => ({ raisedDate: ukToday(), status: 'Open' });

// Service Issue Report (old Order menu; also the old "Images" and "By Vendor" pages): the staff-kept log of service issues.
export default function ServiceIssuesPage() {
  const empty = { from: '', to: '', brand: '', takenBy: '', vendor: '', status: '', q: '', page: 1, all: false };
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState({ from: '', to: '', q: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'refresh' | 'csv' | 'add' | 'upload' | `photo:${fileId}` | `${id}:${field}`
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [photosFor, setPhotosFor] = useState(null); // issue id whose photos are open

  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    const res = await loadIssues(query);
    if (mine !== latest.current) return;
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const photoRow = rows.find((r) => r.id === photosFor) ?? null;
  const change = (next) => { setLink(null); setQuery((q) => ({ ...q, page: 1, all: false, ...next })); };
  const search = () => change({ from: draft.from || draft.to, to: draft.to || draft.from, q: draft.q });
  const reset = () => { setDraft({ from: '', to: '', q: '' }); change(empty); };
  const patch = (id, fields) => setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...fields } : r)) } : d));

  async function saveField(row, field, value) {
    setBusy(`${row.id}:${field}`);
    const res = await saveIssue(row.id, field, value);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: `Issue ${row.id}, ${field}: ${res.message}` }); await load(); return; }
    const saved = MONEY.has(field) ? value.replace(/[£,\s]/g, '') : value;
    patch(row.id, { [field]: saved === '' ? null : saved, ...('finalPrice' in res.data ? { finalPrice: res.data.finalPrice } : {}) });
  }
  async function add() {
    setBusy('add');
    const res = await addIssue(form);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Service issue ${res.data.id} added.` });
    setForm(BLANK());
    setAdding(false);
    await load();
  }
  async function csv() {
    setBusy('csv');
    const res = await issuesLink(query);
    setBusy(null);
    if (!res.ok) { setLink(null); setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }
  async function upload(event) {
    const zone = event.currentTarget;
    const files = [...(zone.files ?? [])];
    const clear = () => { try { zone.value = ''; } catch { /* the zone may already be gone */ } };
    if (!photoRow || files.length === 0) return;
    const room = 5 - photoRow.photos.length;
    if (files.length > room) { setNotice({ tone: 'warning', text: room > 0 ? `Only ${room} more photo(s) can be added to this issue.` : 'This issue already has 5 photos. Remove one first.' }); clear(); return; }
    setBusy('upload');
    let photos = photoRow.photos;
    const problems = [];
    for (const f of files) {
      const res = await uploadPhoto(photoRow.id, f);
      if (res.ok) photos = [...photos, res.data];
      else problems.push(`${f.name}: ${res.message}`);
    }
    setBusy(null);
    clear();
    patch(photoRow.id, { photos });
    setNotice(problems.length ? { tone: 'critical', text: problems.join(' ') } : { tone: 'success', text: `${files.length} photo(s) added to issue ${photoRow.id}.` });
  }
  async function removeOne(fileId) {
    setBusy(`photo:${fileId}`);
    const res = await deletePhoto(photoRow.id, fileId);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    patch(photoRow.id, { photos: photoRow.photos.filter((p) => p.id !== fileId) });
  }

  const first = data && data.total > 0 ? (query.all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (query.all ? rows.length : Math.min(data.page * data.size, data.total)) : 0;
  const pickList = (label, key, options, blank) => (
    <s-select label={label} value={query[key]} onChange={(e) => change({ [key]: e.currentTarget.value })}>
      <s-option value="">{blank}</s-option>
      {options.map((o) => <s-option key={o} value={o}>{o}</s-option>)}
    </s-select>
  );

  return (
    <s-page heading={`Service Issue Report${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" onClick={() => setAdding((v) => !v)}>{adding ? 'Close Add New' : 'Add New'}</s-button>
      <s-button slot="primary-action" loading={(loading && busy === 'refresh') || undefined} onClick={async () => { setBusy('refresh'); try { await load(); } finally { setBusy(null); } }}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && notice.text.startsWith('Your file') && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      {adding && (
        <s-section heading="Add New Service Issue">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap="base">
              {COLUMNS.filter(([f]) => f !== 'finalPrice').map(([field, heading, kind]) => {
                const set = (v) => setForm((x) => ({ ...x, [field]: v }));
                const label = field === 'raisedDate' ? 'Date SO Raised' : field === 'item' ? 'Item (needed)' : heading;
                if (kind === 'date') return <s-date-field key={field} label={label} value={form[field] ?? ''} onChange={(e) => set(e.currentTarget.value)} />;
                if (kind === 'select') {
                  return (
                    <s-select key={field} label={label} value={form[field] ?? ''} onChange={(e) => set(e.currentTarget.value)}>
                      <s-option value="">Select</s-option>
                      {CHOICES[field].map((o) => <s-option key={o} value={o}>{o}</s-option>)}
                    </s-select>
                  );
                }
                return <s-text-field key={field} label={label} value={form[field] ?? ''} onInput={(e) => set(e.currentTarget.value)} />;
              })}
            </s-grid>
            <s-text color="subdued">Final Price is worked out as Price minus Discount. Name is you unless you type another.</s-text>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" loading={busy === 'add' || undefined} disabled={!String(form.item ?? '').trim() || undefined} onClick={add}>Add</s-button>
              <s-button onClick={() => { setForm(BLANK()); setAdding(false); }}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {photoRow && (
        <s-section heading={`Photos for issue ${photoRow.id}${photoRow.orderNo ? ` (order ${photoRow.orderNo})` : ''}`}>
          <s-stack direction="block" gap="base">
            {photoRow.photos.length === 0 && <s-text color="subdued">No photos yet.</s-text>}
            <s-stack direction="inline" gap="base">
              {photoRow.photos.map((p, i) => (
                <s-stack key={p.id} direction="block" gap="small-200" alignItems="center">
                  {p.url ? (
                    <s-link href={p.url} target="_blank"><s-thumbnail src={p.url} alt={`Photo ${i + 1}`} size="large" /></s-link>
                  ) : (
                    <s-text color="subdued">Processing…</s-text>
                  )}
                  <s-button variant="tertiary" tone="critical" loading={busy === `photo:${p.id}` || undefined} onClick={() => removeOne(p.id)} accessibilityLabel={`Remove photo ${i + 1}`}>Remove</s-button>
                </s-stack>
              ))}
            </s-stack>
            {photoRow.photos.length < 5 && (
              <s-drop-zone label={`Add photos (up to ${5 - photoRow.photos.length} more, 20 MB each)`} accept="image/*" multiple disabled={busy === 'upload' || undefined} onChange={upload} />
            )}
            {busy === 'upload' && <s-text>Uploading…</s-text>}
            <s-text color="subdued">Photos are kept in the store's Files (Shopify admin, Content, Files). Removing one here deletes it there too.</s-text>
            <s-button onClick={() => setPhotosFor(null)}>Close photos</s-button>
          </s-stack>
        </s-section>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field label="Search" placeholder="Order no, item, brand or code" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
            <s-date-field label="Raised from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button variant="primary" onClick={search}>GO</s-button>
            <s-button onClick={reset}>Reset</s-button>
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="end">
            {pickList('Brand', 'brand', data?.brands ?? [], '-- Brand --')}
            {pickList('Vendor', 'vendor', data?.vendors ?? [], '-- Vendor --')}
            {pickList('User', 'takenBy', data?.takers ?? [], '-- User --')}
            {pickList('Status', 'status', ['Open', 'Closed'], 'All')}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? (data.total ? `${first} - ${last} Records Of ${data.total}` : '0 Records') : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={query.all} onPage={(p) => setQuery((q) => ({ ...q, page: p, all: false }))} onAll={() => setQuery((q) => ({ ...q, all: true }))} />}
            <s-button loading={busy === 'csv' || undefined} onClick={csv}>Download CSV</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No service issues" hint="Press Add New to log one, or change the filters." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">ID</s-table-header>
              {COLUMNS.map(([field, heading]) => <s-table-header key={field}>{heading}</s-table-header>)}
              <s-table-header>Vendor</s-table-header>
              <s-table-header>Photos</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      <s-text>{r.id}</s-text>
                      {r.orderId && <s-link href={orderUrl(r.orderId)}>Order</s-link>}
                    </s-stack>
                  </s-table-cell>
                  {COLUMNS.map(([field, heading, kind, width]) => (
                    <s-table-cell key={field}><Cell row={r} field={field} heading={heading} kind={kind} width={width} busy={busy} onSave={saveField} /></s-table-cell>
                  ))}
                  <s-table-cell>{r.vendor ?? <s-text color="subdued">-</s-text>}</s-table-cell>
                  <s-table-cell>
                    <s-button variant={photosFor === r.id ? 'primary' : 'secondary'} onClick={() => { const open = photosFor !== r.id; setPhotosFor(open ? r.id : null); if (open) window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{`Photos (${r.photos.length})`}</s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
