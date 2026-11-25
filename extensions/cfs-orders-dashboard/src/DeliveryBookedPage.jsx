import { useCallback, useEffect, useState } from 'preact/hooks';
import { labelFor } from '../../cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import { useStaff } from './useStaff';
import { formatDate, statusTone } from './orderList';
import { changedDrops, downloadLink, groupByDay, loadBooked, poundsText, rescheduleBooked, runTitle, saveDropsForRun } from './bookedDelivery';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

// Delivery Booked, laid out like the old "Delivery Booking History": a block for each day, van and driver, in drop order.
// EDIT unlocks New Drop for a block, SAVE keeps it (an order in the way moves down). Tick lines to export or reschedule them.
export default function DeliveryBookedPage() {
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({ from: '', to: '', brand: '', q: '' });
  const [applied, setApplied] = useState({ from: '', to: '', brand: '', q: '' });
  const [picked, setPicked] = useState(new Set());
  const [editing, setEditing] = useState({}); // run key -> { lineId: typed drop }
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadBooked(applied);
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setData(res.data);
    setError(null);
    setDraft((d) => (d.from ? d : { ...d, from: res.data.from, to: res.data.to }));
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const runs = data?.runs ?? [];
  const canWrite = !!staff;
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const tickMany = (rows, on) => setPicked((p) => { const n = new Set(p); rows.forEach((r) => (on ? n.add(r.lineId) : n.delete(r.lineId))); return n; });

  function go() {
    setApplied({ ...draft, q: draft.q.trim() });
    setPicked(new Set());
    setEditing({});
  }

  async function fetchLink(what) {
    setBusy(true);
    const res = await downloadLink(what);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }
  const exportAll = () => fetchLink({ kind: 'booked', filter: applied });
  const exportPicked = () => {
    if (picked.size === 0) { setNotice({ tone: 'warning', text: 'Select Record(s) to Export.' }); return; }
    fetchLink({ kind: 'booked', filter: applied, lineIds: [...picked] });
  };

  function startEdit(run) { setEditing((e) => ({ ...e, [run.key]: Object.fromEntries(run.rows.map((r) => [r.lineId, String(r.drop ?? '')])) })); }
  function stopEdit(run) { setEditing((e) => { const n = { ...e }; delete n[run.key]; return n; }); }
  async function saveRun(run) {
    const { changes, problem } = changedDrops(run.rows, editing[run.key] ?? {});
    if (problem) { setNotice({ tone: 'critical', text: problem }); return; }
    if (changes.length === 0) { stopEdit(run); setNotice({ tone: 'info', text: 'No drop numbers were changed.' }); return; }
    setBusy(true);
    const res = await saveDropsForRun(run, changes);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    stopEdit(run);
    setNotice({ tone: 'success', text: `Saved ${res.data.saved} drop${res.data.saved === 1 ? '' : 's'}.${res.data.moved ? ` ${res.data.moved} other order${res.data.moved === 1 ? ' was' : 's were'} moved down.` : ''}` });
    await load();
  }

  async function reschedule() {
    setBusy(true);
    const res = await rescheduleBooked([...picked], reason);
    setBusy(false);
    setConfirm(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Rescheduled ${res.data.cleared} line${res.data.cleared === 1 ? '' : 's'}. They are back on the Book Delivery list.` });
    setPicked(new Set());
    setReason('');
    await load();
  }
  function askReschedule() {
    if (picked.size === 0) { setNotice({ tone: 'warning', text: 'Select Record(s) to Reschedule.' }); return; }
    setConfirm(true);
  }

  const summary = data ? `${data.from} to ${data.to} · ${data.summary.runs} delivery run${data.summary.runs === 1 ? '' : 's'} · ${data.summary.entries} order entr${data.summary.entries === 1 ? 'y' : 'ies'} · ${picked.size} selected` : 'Loading...';

  return (
    <s-page heading="Delivery Booked">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/book-delivery">Book Delivery</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the bookings">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing deliveries needs a verified Shopify staff sign-in.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && notice.text.startsWith('Your file') && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-select label="Brand / vendor" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.currentTarget.value })}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-search-field label="Search" placeholder="Order No., Postcode" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
            <s-button variant="primary" onClick={go}>GO</s-button>
          </s-stack>
          <s-text color="subdued">{summary}</s-text>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button onClick={exportPicked} disabled={busy || runs.length === 0 || undefined}>Export selected</s-button>
            <s-button onClick={exportAll} disabled={busy || runs.length === 0 || undefined}>Download All</s-button>
            <s-button tone="critical" onClick={askReschedule} disabled={!canWrite || busy || undefined}>RESCHEDULE DELIVERY</s-button>
          </s-stack>
          {confirm && (
            <s-banner tone="warning" heading={`Reschedule ${picked.size} line${picked.size === 1 ? '' : 's'}?`}>
              <s-stack gap="small">
                <s-text>This clears their booking so they can be booked again. The customer is not emailed.</s-text>
                <s-text-field label="Reason (optional)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
              </s-stack>
              <s-button slot="primary-action" disabled={busy || undefined} loading={busy || undefined} onClick={reschedule}>Reschedule</s-button>
              <s-button slot="secondary-actions" onClick={() => setConfirm(false)}>Cancel</s-button>
            </s-banner>
          )}
        </s-stack>
      </s-section>

      {data && runs.length === 0 && (
        <s-section><EmptyState title="No bookings" hint="No deliveries are booked for these dates. Change the dates or the brand, then press GO." /></s-section>
      )}

      {groupByDay(runs).map((day) => (
        <s-stack key={day.date} gap="base">
          <s-heading>{DAY.format(new Date(`${day.date}T00:00:00Z`))}</s-heading>
          {day.runs.map((run) => {
            const typed = editing[run.key];
            const allPicked = run.rows.length > 0 && run.rows.every((r) => picked.has(r.lineId));
            return (
              <s-section key={run.key} heading={runTitle(run)}>
                <s-stack gap="base">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    {typed ? (
                      <>
                        <s-button variant="primary" disabled={busy || undefined} onClick={() => saveRun(run)}>SAVE</s-button>
                        <s-button onClick={() => stopEdit(run)}>Cancel</s-button>
                      </>
                    ) : (
                      <s-button tone="critical" disabled={!canWrite || undefined} onClick={() => startEdit(run)}>EDIT</s-button>
                    )}
                    <s-button disabled={busy || undefined} onClick={() => fetchLink({ kind: 'picklist', date: run.date, vanId: run.vanId })}>Pick List</s-button>
                    <s-button disabled={busy || undefined} onClick={() => fetchLink({ kind: 'driversheet', date: run.date, vanId: run.vanId })}>Driver Sheet</s-button>
                  </s-stack>
                  <s-table>
                    <s-table-header-row>
                      <s-table-header><s-checkbox label="Select all in this run" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => tickMany(run.rows, e.currentTarget.checked)} /></s-table-header>
                      <s-table-header>Date</s-table-header>
                      <s-table-header listSlot="primary">Order No.</s-table-header>
                      <s-table-header>Item</s-table-header>
                      <s-table-header>Product Code</s-table-header>
                      <s-table-header format="numeric">Qty.</s-table-header>
                      <s-table-header>Box</s-table-header>
                      <s-table-header>Confirm?</s-table-header>
                      <s-table-header>Status</s-table-header>
                      <s-table-header>Time</s-table-header>
                      <s-table-header format="numeric">Drop</s-table-header>
                      <s-table-header>New Drop</s-table-header>
                      <s-table-header>Delivery Type</s-table-header>
                      <s-table-header>Post Code</s-table-header>
                      <s-table-header format="numeric">Total Amount</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {run.rows.map((r) => (
                        <s-table-row key={r.lineId}>
                          <s-table-cell><s-checkbox label={`Select ${r.orderName} ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                          <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>
                          <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                          <s-table-cell>{r.product}</s-table-cell>
                          <s-table-cell>{r.code}</s-table-cell>
                          <s-table-cell>{r.quantity}</s-table-cell>
                          <s-table-cell>{r.box ?? '--'}</s-table-cell>
                          <s-table-cell>{r.delivery === 'confirmed' ? <s-badge tone="success">Confirmed</s-badge> : ''}</s-table-cell>
                          <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : ''}</s-table-cell>
                          <s-table-cell>{r.amPm}</s-table-cell>
                          <s-table-cell>{r.drop ?? ''}</s-table-cell>
                          <s-table-cell>
                            {typed
                              ? <s-text-field label="New drop" labelAccessibilityVisibility="exclusive" value={typed[r.lineId] ?? ''} onInput={(e) => { const v = e.currentTarget.value; setEditing((s) => ({ ...s, [run.key]: { ...s[run.key], [r.lineId]: v } })); }} />
                              : (r.drop ?? '')}
                          </s-table-cell>
                          <s-table-cell>{r.deliveryType}</s-table-cell>
                          <s-table-cell>{r.postcode}</s-table-cell>
                          <s-table-cell>{poundsText(r.amountMinor)}</s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>
                  <s-text type="strong">Total: {poundsText(run.totalMinor)}</s-text>
                </s-stack>
              </s-section>
            );
          })}
        </s-stack>
      ))}
    </s-page>
  );
}
