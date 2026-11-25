import { useCallback, useEffect, useState } from 'preact/hooks';
import { labelFor } from '../../cfs-order-status/src/statuses';
import { useStaff } from './useStaff';
import { formatDate, statusTone } from './orderList';
import { MAX_DROP, PREBOOK, bookBulk, bookedBulkText, bookingProblem, carriedLines, cascadeDrops, forcePmFrom, loadBookingPage, rescheduleBulk } from './bulkDelivery';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const DROPS = Array.from({ length: MAX_DROP }, (_, i) => i + 1);

// The Delivery Booking page the old system opens after "Book Delivery / Collection": one date and van for everything, a drop and AM/PM
// per line. Changing the first drop fills the rest (same order keeps its drop); PM on a line makes every line below PM.
export default function DeliveryBookingPage() {
  const staff = useStaff();
  const [ids] = useState(() => carriedLines());
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [date, setDate] = useState('');
  const [vanId, setVanId] = useState('');
  const [drops, setDrops] = useState({});
  const [slots, setSlots] = useState({});
  const [ticked, setTicked] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // 'book' | 'reschedule'
  const [warn, setWarn] = useState(null); // order names holding the drop
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (ids.length === 0) { setPage({ rows: [], vans: [] }); return; }
    const res = await loadBookingPage(ids);
    if (!res.ok) { setError(res.message); return; }
    setError(null);
    setPage(res.data);
    setDrops(Object.fromEntries(res.data.rows.map((r) => [r.lineId, r.drop ? String(r.drop) : ''])));
    setSlots(Object.fromEntries(res.data.rows.map((r) => [r.lineId, r.amPm])));
  }, [ids]);
  useEffect(() => { load(); }, [load]);

  const rows = page?.rows ?? [];
  const lineIds = rows.map((r) => r.lineId);
  const orderIds = rows.map((r) => r.orderId);
  const allTicked = rows.length > 0 && rows.every((r) => ticked.has(r.lineId));
  const tick = (id, on) => setTicked((t) => { const n = new Set(t); if (on) n.add(id); else n.delete(id); return n; });
  const canWrite = !!staff;

  function changeDrop(index, value) {
    if (index === 0 && value) {
      const next = cascadeDrops(orderIds, lineIds.map((id) => drops[id] ?? ''), Number(value));
      setDrops(Object.fromEntries(lineIds.map((id, i) => [id, next[i]])));
    } else setDrops({ ...drops, [lineIds[index]]: value });
    setWarn(null);
  }
  function changeSlot(index, value) {
    if (value === 'PM') {
      const next = forcePmFrom(lineIds.map((id) => slots[id] ?? ''), index);
      setSlots(Object.fromEntries(lineIds.map((id, i) => [id, next[i]])));
    } else setSlots({ ...slots, [lineIds[index]]: value });
    setWarn(null);
  }

  function askBook() {
    const problem = bookingProblem({ date, vanId, drops, slots }, rows.filter((r) => ticked.has(r.lineId)).map((r) => r.lineId));
    if (problem) { setNotice({ tone: 'warning', text: problem }); return; }
    setConfirm('book');
  }
  function askReschedule() {
    if (ticked.size === 0) { setNotice({ tone: 'warning', text: 'Please Select Record(s) to Reschedule Delivery.' }); return; }
    setConfirm('reschedule');
  }

  async function book(allowDuplicate = false) {
    setBusy(true);
    const chosen = rows.filter((r) => ticked.has(r.lineId));
    const res = await bookBulk({ date, vanId, rows: chosen.map((r) => ({ lineId: r.lineId, drop: Number(drops[r.lineId]), amPm: slots[r.lineId] })), allowDuplicate });
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      if (res.duplicates?.length) { setWarn(res.duplicates); setNotice(null); } else setNotice({ tone: 'critical', text: res.message });
      return;
    }
    setWarn(null);
    setNotice({ tone: res.data.emailFailed ? 'warning' : 'success', text: bookedBulkText(res.data, vanId === PREBOOK) });
    setTicked(new Set());
    await load();
  }

  async function reschedule() {
    setBusy(true);
    const res = await rescheduleBulk(rows.filter((r) => ticked.has(r.lineId)).map((r) => r.lineId));
    setBusy(false);
    setConfirm(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: `Delivery Rescheduled: ${res.data.cleared} item${res.data.cleared === 1 ? '' : 's'}.` });
    setTicked(new Set());
    await load();
  }

  return (
    <s-page heading="Delivery Booking">
      <s-button slot="secondary-actions" href="/book-delivery">Book Delivery</s-button>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      {error && <s-banner tone="critical" heading="Could not load the items">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Booking a delivery needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}
      {!page && !error && <s-spinner accessibilityLabel="Loading" />}

      {page && rows.length === 0 && (
        <s-section>
          <s-stack gap="base" alignItems="center">
            <s-text tone="critical" type="strong">No Valid Record Found.</s-text>
            <s-link href="/book-delivery">Go back to Book Delivery and tick the items to book</s-link>
          </s-stack>
        </s-section>
      )}

      {page && rows.length > 0 && (
        <>
          <s-section>
            <s-stack gap="base">
              <s-text>Showing 1 - {rows.length} Records Of {rows.length}</s-text>
              <s-stack direction="inline" gap="base" alignItems="end">
                <s-date-field label="Delivery date" value={date} onChange={(e) => { setDate(e.currentTarget.value); setWarn(null); }} />
                <s-select label="Van" value={vanId} onChange={(e) => { setVanId(e.currentTarget.value); setWarn(null); }}>
                  <s-option value="">Van</s-option>
                  {page.vans.map((v) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
                  <s-option value={PREBOOK}>Prebook</s-option>
                </s-select>
              </s-stack>
              {page.vans.length === 0 && <s-text color="subdued">No vans yet. Add them on the <s-link href="/van-management">Van Management</s-link> page.</s-text>}
              <s-text color="subdued">Tick the lines to book, set the first drop and the rest follow. PM on a line makes every line below it PM.</s-text>

              {warn && (
                <s-banner tone="warning" heading="This drop is already taken">
                  {warn.join(', ')} already {warn.length === 1 ? 'has' : 'have'} this van and drop on that day. Booking anyway gives this order the drop and moves them down one place.
                  <s-button slot="primary-action" disabled={busy || undefined} onClick={() => book(true)}>Book anyway</s-button>
                  <s-button slot="secondary-actions" onClick={() => setWarn(null)}>Change it</s-button>
                </s-banner>
              )}
              {confirm && (
                <s-banner tone="warning" heading="Please Confirm This Action..!">
                  {confirm === 'book'
                    ? `Book ${ticked.size} item${ticked.size === 1 ? '' : 's'} for ${dmy(date)} and email the customers.`
                    : `Clear the delivery booking on ${ticked.size} item${ticked.size === 1 ? '' : 's'}. The customers are not emailed.`}
                  <s-button slot="primary-action" disabled={busy || undefined} loading={busy || undefined} onClick={() => (confirm === 'book' ? book(false) : reschedule())}>Confirm</s-button>
                  <s-button slot="secondary-actions" onClick={() => setConfirm(null)}>Cancel</s-button>
                </s-banner>
              )}

              <s-stack direction="inline" gap="base">
                <s-button variant="primary" disabled={!canWrite || busy || undefined} onClick={askBook}>EMAIL DELIVERY BOOKING</s-button>
                <s-button tone="critical" disabled={!canWrite || busy || undefined} onClick={askReschedule}>RESCHEDULE</s-button>
              </s-stack>
            </s-stack>
          </s-section>

          <s-section padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allTicked} onChange={(e) => setTicked(e.currentTarget.checked ? new Set(lineIds) : new Set())} /></s-table-header>
                <s-table-header>Date</s-table-header>
                <s-table-header listSlot="primary">OrderNo.</s-table-header>
                <s-table-header>Item</s-table-header>
                <s-table-header>Code</s-table-header>
                <s-table-header format="numeric">Qty</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Postcode</s-table-header>
                <s-table-header>Del.Date</s-table-header>
                <s-table-header>Drop</s-table-header>
                <s-table-header>Time</s-table-header>
                <s-table-header>Del.Type</s-table-header>
                <s-table-header>eMail?</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {rows.map((r, i) => (
                  <s-table-row key={r.lineId}>
                    <s-table-cell><s-checkbox label={`Select ${r.orderName} ${r.product}`} labelAccessibilityVisibility="exclusive" checked={ticked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                    <s-table-cell>{r.orderCreatedAt ? formatDate(r.orderCreatedAt) : ''}</s-table-cell>
                    <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                    <s-table-cell>{r.product}</s-table-cell>
                    <s-table-cell>{r.code}</s-table-cell>
                    <s-table-cell>{r.quantity}</s-table-cell>
                    <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : ''}</s-table-cell>
                    <s-table-cell>{r.postcode}</s-table-cell>
                    <s-table-cell>{dmy(r.deliveryDate)}{r.prebook ? ' (Prebook)' : ''}</s-table-cell>
                    <s-table-cell>
                      <s-select label="Drop" labelAccessibilityVisibility="exclusive" value={drops[r.lineId] ?? ''} onChange={(e) => changeDrop(i, e.currentTarget.value)}>
                        <s-option value="">-- Drop --</s-option>
                        {DROPS.map((n) => <s-option key={n} value={String(n)}>Drop {n}</s-option>)}
                      </s-select>
                    </s-table-cell>
                    <s-table-cell>
                      <s-select label="AM/PM" labelAccessibilityVisibility="exclusive" value={slots[r.lineId] ?? ''} onChange={(e) => changeSlot(i, e.currentTarget.value)}>
                        <s-option value="">AM/PM</s-option>
                        <s-option value="AM">AM</s-option>
                        <s-option value="PM">PM</s-option>
                      </s-select>
                    </s-table-cell>
                    <s-table-cell>{r.deliveryType}</s-table-cell>
                    <s-table-cell>{r.emailed ? <s-text tone="success" type="strong">Yes</s-text> : r.deliveryDate ? <s-text tone="critical" type="strong">No</s-text> : ''}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>
        </>
      )}
    </s-page>
  );
}
