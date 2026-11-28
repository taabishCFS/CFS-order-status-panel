import { useCallback, useEffect, useRef, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { formatDate } from './orderList';
import { addCaller, feedbackLink, loadFeedback, removeCaller, saveCall, shareOutCalls } from './feedbackCalling';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');
const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

// One editable call detail. Dates and dropdowns save when changed, text when the box is left; only this field shows it is saving.
function Field({ row, field, kind, options, busy, onSave }) {
  const [value, setValue] = useState(row[field] ?? '');
  useEffect(() => setValue(row[field] ?? ''), [row, field]);
  const saving = busy === `${row.orderId}:${field}`;
  const label = { callDate: 'Calling date', staff: 'Staff', callStatus: 'Call status', remark: 'Remark', remark2: 'Remark 2', rating: 'Rating received', ratingDate: 'Rating date' }[field];
  const save = (v) => { if (v !== (row[field] ?? '')) onSave(row, field, v); };
  // Without a minimum width the table squeezes the boxes to a letter wide.
  return <s-box minInlineSize={{ date: '150px', select: '130px', area: '220px', text: '90px' }[kind]}>{control()}</s-box>;
  function control() {
  if (kind === 'date') return <s-date-field label={label} labelAccessibilityVisibility="exclusive" value={value} disabled={saving || undefined} onChange={(e) => { setValue(e.currentTarget.value); save(e.currentTarget.value); }} />;
  if (kind === 'select') {
    return (
      <s-select label={label} labelAccessibilityVisibility="exclusive" value={value} disabled={saving || undefined} onChange={(e) => { setValue(e.currentTarget.value); save(e.currentTarget.value); }}>
        <s-option value="">{field === 'staff' ? '-- Staff --' : '-- Status --'}</s-option>
        {options.map((o) => <s-option key={o} value={o}>{o}</s-option>)}
      </s-select>
    );
  }
  const Tag = kind === 'area' ? 's-text-area' : 's-text-field';
  return <Tag label={label} labelAccessibilityVisibility="exclusive" value={value} disabled={saving || undefined} onInput={(e) => setValue(e.currentTarget.value)} onChange={(e) => save(e.currentTarget.value.trim())} />;
  }
}

// Feedback Calling (old Order menu): orders whose every item is Completed, to phone the customer for a review and note the answer.
export default function FeedbackCallingPage() {
  const [query, setQuery] = useState(() => ({ from: ukToday(), to: ukToday(), q: '', staff: '', page: 1, all: false }));
  const [draft, setDraft] = useState(() => ({ from: ukToday(), to: ukToday(), q: '' }));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'refresh' | 'share' | 'csv' | 'add' | `remove:${name}` | `${orderId}:${field}`
  const [newCaller, setNewCaller] = useState('');
  const [showCallers, setShowCallers] = useState(false);

  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    const res = await loadFeedback(query);
    if (mine !== latest.current) return;
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const callers = data?.callers ?? [];
  const rows = data?.rows ?? [];
  const change = (next) => { setLink(null); setQuery((q) => ({ ...q, page: 1, all: false, ...next })); };
  const search = () => change({ from: draft.from || draft.to, to: draft.to || draft.from, q: draft.q });
  const reset = () => { const t = ukToday(); setDraft({ from: t, to: t, q: '' }); change({ from: t, to: t, q: '', staff: '' }); };

  async function saveField(row, field, value) {
    setBusy(`${row.orderId}:${field}`);
    const res = await saveCall(row.orderId, field, value);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: `${row.orderName}: ${res.message}` }); await load(); return; }
    setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.orderId === row.orderId ? { ...r, [field]: value } : r)) } : d));
  }
  async function share() {
    setBusy('share');
    const res = await shareOutCalls(query);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: res.data ? `${res.data} order(s) shared out among the callers.` : 'Every order in these dates already has a caller.' });
    await load();
  }
  async function csv() {
    setBusy('csv');
    const res = await feedbackLink(query);
    setBusy(null);
    if (!res.ok) { setLink(null); setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }
  async function callerChange(kind, name) {
    setBusy(kind === 'add' ? 'add' : `remove:${name}`);
    const res = kind === 'add' ? await addCaller(name) : await removeCaller(name);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    if (kind === 'add') setNewCaller('');
    setData((d) => (d ? { ...d, callers: res.data } : d));
  }

  const first = data && data.total > 0 ? (query.all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (query.all ? data.rows.length : Math.min(data.page * data.size, data.total)) : 0;

  return (
    <s-page heading={`Feedback Calling${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" onClick={() => setShowCallers((v) => !v)}>{showCallers ? 'Hide callers' : 'Callers'}</s-button>
      <s-button slot="primary-action" loading={(loading && busy === 'refresh') || undefined} onClick={async () => { setBusy('refresh'); try { await load(); } finally { setBusy(null); } }}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      {showCallers && (
        <s-section heading="Callers">
          <s-stack direction="block" gap="base">
            <s-text color="subdued">The people who make feedback calls. They appear in the Staff list and share out the orders in this order.</s-text>
            <s-stack direction="inline" gap="small">
              {callers.map((c) => (
                <s-stack key={c} direction="inline" gap="small-200" alignItems="center">
                  <s-badge>{c}</s-badge>
                  <s-button variant="tertiary" tone="critical" loading={busy === `remove:${c}` || undefined} disabled={callers.length === 1 || undefined} onClick={() => callerChange('remove', c)} accessibilityLabel={`Remove ${c}`}>Remove</s-button>
                </s-stack>
              ))}
            </s-stack>
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-text-field label="Add a caller" value={newCaller} onInput={(e) => setNewCaller(e.currentTarget.value)} />
              <s-button loading={busy === 'add' || undefined} disabled={!newCaller.trim() || undefined} onClick={() => callerChange('add', newCaller)}>Add</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field label="Order No. / Postcode" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
            <s-date-field label="Completed from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-select label="Staff" value={query.staff} onChange={(e) => change({ staff: e.currentTarget.value })}>
              <s-option value="">All Staff</s-option>
              {callers.map((c) => <s-option key={c} value={c}>{c}</s-option>)}
            </s-select>
            <s-button variant="primary" onClick={search}>Search</s-button>
            <s-button onClick={reset}>Reset</s-button>
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `${first} - ${last} Records Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={query.all} onPage={(p) => setQuery((q) => ({ ...q, page: p, all: false }))} onAll={() => setQuery((q) => ({ ...q, all: true }))} />}
            <s-stack direction="inline" gap="small">
              <s-button loading={busy === 'share' || undefined} disabled={(busy && busy !== 'share') || undefined} onClick={share}>Share out unassigned</s-button>
              <s-button loading={busy === 'csv' || undefined} disabled={(busy && busy !== 'csv') || undefined} onClick={csv}>Download CSV</s-button>
            </s-stack>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No completed orders" hint="No order had all its items Completed on these dates. Pick other dates or press Reset." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order No.</s-table-header>
              <s-table-header>Order Date</s-table-header>
              <s-table-header>Completed Date</s-table-header>
              <s-table-header>Month</s-table-header>
              <s-table-header>Alloc.Date</s-table-header>
              <s-table-header>Calling Date</s-table-header>
              <s-table-header>Staff</s-table-header>
              <s-table-header>Call Status</s-table-header>
              <s-table-header>Remark</s-table-header>
              <s-table-header>Remark 2</s-table-header>
              <s-table-header>Rating Recv</s-table-header>
              <s-table-header>Rating Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.orderId}>
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                  <s-table-cell>{r.completedDate ? <s-badge tone="success">{dmy(r.completedDate)}</s-badge> : <s-text color="subdued">Not known</s-text>}</s-table-cell>
                  <s-table-cell>{r.month}</s-table-cell>
                  <s-table-cell>{dmy(r.allocDate)}</s-table-cell>
                  <s-table-cell><Field row={r} field="callDate" kind="date" busy={busy} onSave={saveField} /></s-table-cell>
                  <s-table-cell><Field row={r} field="staff" kind="select" options={r.staff && !callers.includes(r.staff) ? [...callers, r.staff] : callers} busy={busy} onSave={saveField} /></s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      <Field row={r} field="callStatus" kind="select" options={['Completed', 'Pending']} busy={busy} onSave={saveField} />
                      {r.callStatus === 'Completed' ? <s-badge tone="success">Called</s-badge> : <s-badge tone="warning">To call</s-badge>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell><Field row={r} field="remark" kind="area" busy={busy} onSave={saveField} /></s-table-cell>
                  <s-table-cell><Field row={r} field="remark2" kind="area" busy={busy} onSave={saveField} /></s-table-cell>
                  <s-table-cell><Field row={r} field="rating" kind="text" busy={busy} onSave={saveField} /></s-table-cell>
                  <s-table-cell><Field row={r} field="ratingDate" kind="date" busy={busy} onSave={saveField} /></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
