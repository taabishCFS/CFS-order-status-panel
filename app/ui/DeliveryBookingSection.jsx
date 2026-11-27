import { useCallback, useEffect, useState } from 'react';
import { useStaff } from './useStaff';
import { OWN_PARTNER, PARTNERS, SLOT_OPTIONS, bookLines, bookedText, bookingLine, checkDrop, dropNumbers, loadOrderDelivery, rescheduleLines, rescheduledText } from './delivery';

const EMPTY = { partner: OWN_PARTNER, date: '', vanId: '', driverId: '', drop: '', amPm: '' };
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Book Delivery on an order, laid out like the old system:
//   [Book Delivery]  [partner]
//   [date] [Driver] [VAN] [Drop] [Delivery slot]
//   [BOOK & EMAIL] [BOOK & SAVE] [RESCHEDULE]   Delivery Update History
// CFS has van, driver, drop and slot; the carriers (TNT, Pallet...) only get a date.
// `id` is the numeric order id; `picked` is the ticked line ids.
export default function DeliveryBookingSection({ id, lines, picked, setNotice }) {
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [warn, setWarn] = useState(null); // { names, email } when a drop is already taken
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [reason, setReason] = useState('');
  const [emailIt, setEmailIt] = useState(true);
  const [attempted, setAttempted] = useState('');
  const [charge, setCharge] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const res = await loadOrderDelivery(id);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const own = form.partner === OWN_PARTNER;
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setWarn(null); };
  const none = picked.length === 0;
  const ready = !none && !!form.date && !!staff;
  const bookedPicked = (data?.bookings ?? []).filter((b) => picked.includes(b.lineId));
  const fleet = data?.fleet ?? { drivers: [], vans: [] };
  const nameOf = (lineId) => lines.find((l) => l.id === lineId)?.title ?? 'Item';

  async function book(emailCustomer, allowDuplicate = false) {
    setBusy(allowDuplicate ? 'book-anyway' : emailCustomer ? 'book-email' : 'book-save');
    if (!allowDuplicate && own && form.vanId && form.drop) {
      const chk = await checkDrop(id, picked, form);
      if (chk.ok && chk.duplicates.length > 0) { setWarn({ names: chk.duplicates, email: emailCustomer }); setBusy(false); return; }
    }
    const res = await bookLines(id, picked, form, allowDuplicate, emailCustomer);
    setBusy(false);
    if (!res.ok) { if (res.duplicate) setWarn({ names: res.duplicates ?? [], email: emailCustomer }); else setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: res.email && res.email !== 'queued' && res.email !== 'not_requested' ? 'warning' : 'success', text: bookedText(res) });
    setForm(EMPTY);
    setWarn(null);
    await load();
  }

  async function reschedule() {
    setBusy('reschedule');
    const res = await rescheduleLines(id, bookedPicked.map((b) => b.lineId), reason, emailIt, attempted === 'yes', charge);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: res.data.email === 'queued' || res.data.email === 'not_requested' ? 'success' : 'warning', text: rescheduledText(res.data) });
    setRescheduling(false);
    setReason('');
    setAttempted('');
    setCharge('');
    await load();
  }

  return (
    <s-section heading="Book Delivery">
      <s-stack gap="base">
        {error && <s-banner tone="critical" dismissible onDismiss={() => setError(null)}>{error}</s-banner>}
        {staff === null && <s-banner tone="warning">Booking a delivery needs a verified Shopify staff sign-in.</s-banner>}

        {data && data.bookings.length > 0 && (
          <s-stack gap="small-200">
            <s-text type="strong">Booked</s-text>
            {data.bookings.map((b) => (
              <s-stack key={b.lineId} gap="none">
                <s-text>{nameOf(b.lineId)}: {bookingLine(b)}</s-text>
                {b.confirmNote && <s-text color="subdued">Customer note: {b.confirmNote}</s-text>}
              </s-stack>
            ))}
          </s-stack>
        )}

        <s-select label="Delivery partner" value={form.partner} onChange={(e) => set({ partner: e.currentTarget.value, ...(e.currentTarget.value === OWN_PARTNER ? {} : { vanId: '', driverId: '', drop: '', amPm: '' }) })}>
          {PARTNERS.map((p) => <s-option key={p} value={p}>{p}</s-option>)}
        </s-select>

        <s-grid gridTemplateColumns={own ? 'minmax(180px, 1.4fr) repeat(4, minmax(0, 1fr))' : '1fr'} gap="base">
          <s-date-field label="Delivery date" value={form.date} onChange={(e) => set({ date: e.currentTarget.value })} />
          {own && (
            <>
              <s-select label="Driver" value={form.driverId} onChange={(e) => set({ driverId: e.currentTarget.value })}>
                <s-option value="">-- Driver --</s-option>
                {fleet.drivers.map((d) => <s-option key={d.id} value={d.id}>{d.name}</s-option>)}
              </s-select>
              <s-select label="VAN" value={form.vanId} onChange={(e) => set({ vanId: e.currentTarget.value, ...(e.currentTarget.value ? {} : { drop: '' }) })}>
                <s-option value="">-- VAN --</s-option>
                {fleet.vans.map((v) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
              </s-select>
              <s-select label="Drop" value={form.drop} disabled={!form.vanId || undefined} onChange={(e) => set({ drop: e.currentTarget.value })}>
                <s-option value="">-- Drop --</s-option>
                {dropNumbers().map((n) => <s-option key={n} value={String(n)}>{n}</s-option>)}
              </s-select>
              <s-select label="Delivery slot" value={form.amPm} onChange={(e) => set({ amPm: e.currentTarget.value })}>
                <s-option value="">-- Delivery slot --</s-option>
                {SLOT_OPTIONS.map((s) => <s-option key={s.value} value={s.value}>{s.label}</s-option>)}
              </s-select>
            </>
          )}
        </s-grid>
        {own && form.amPm === 'PM' && form.drop && <s-text color="subdued">PM on a drop also moves every later drop on this van and day to PM.</s-text>}
        {own && fleet.vans.length === 0 && <s-text color="subdued">No vans yet. Add vans and drivers on the <s-link href="/van-management">Van Management</s-link> page.</s-text>}
        <s-text color="subdued">Tick the items in the Items table first.</s-text>

        {warn && (
          <s-banner tone="warning" heading="This drop is already taken">
            {warn.names.join(', ')} already {warn.names.length === 1 ? 'has' : 'have'} this van and drop on that day. Booking anyway gives this order the drop and moves them down one place.
            <s-button slot="primary-action" disabled={busy || undefined} loading={busy === 'book-anyway' || undefined} onClick={() => book(warn.email, true)}>Book anyway</s-button>
            <s-button slot="secondary-actions" onClick={() => setWarn(null)}>Change it</s-button>
          </s-banner>
        )}

        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button variant="primary" disabled={!ready || busy || undefined} loading={busy === 'book-email' || undefined} onClick={() => book(true)}>BOOK &amp; EMAIL</s-button>
          <s-button variant="primary" disabled={!ready || busy || undefined} loading={busy === 'book-save' || undefined} onClick={() => book(false)}>BOOK &amp; SAVE</s-button>
          <s-button tone="critical" disabled={bookedPicked.length === 0 || !staff || busy || undefined} onClick={() => setRescheduling(true)}>RESCHEDULE</s-button>
          <s-link onClick={() => setShowHistory(!showHistory)}>Delivery Update History</s-link>
        </s-stack>

        {rescheduling && (
          <s-banner tone="warning" heading={`Reschedule ${bookedPicked.length} item${bookedPicked.length === 1 ? '' : 's'}?`}>
            <s-stack gap="small">
              <s-text>This clears their booking so they can be booked again.</s-text>
              <s-text-field label="Reason (the customer is told this)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
              <s-select label="Delivery attempted before?" value={attempted} onChange={(e) => setAttempted(e.currentTarget.value)} details="Yes lists the ticked items on Accounts > Reschedule Delivery Orders.">
                <s-option value="">-- Choose --</s-option>
                <s-option value="yes">Yes</s-option>
                <s-option value="no">No</s-option>
              </s-select>
              {attempted === 'yes' && (
                <s-money-field label="Reschedule charge agreed with the customer (£, VAT included)" value={charge} onInput={(e) => setCharge(e.currentTarget.value)} details="Only if the customer agreed to pay. Leave empty for no charge. The amount is added to the Shopify order; the customer is not emailed about it." />
              )}
              <s-checkbox label="Email the customer" checked={emailIt} onChange={(e) => setEmailIt(e.currentTarget.checked)} />
            </s-stack>
            <s-button slot="primary-action" disabled={!reason.trim() || !attempted || busy || undefined} loading={busy === 'reschedule' || undefined} onClick={reschedule}>Reschedule</s-button>
            <s-button slot="secondary-actions" onClick={() => setRescheduling(false)}>Cancel</s-button>
          </s-banner>
        )}

        {showHistory && (
          <s-stack gap="small-200">
            <s-text type="strong">Delivery Update History</s-text>
            {(data?.history ?? []).length === 0 && <s-text color="subdued">No delivery updates yet.</s-text>}
            {(data?.history ?? []).slice(0, 20).map((h) => (
              <s-text key={h.id} color="subdued">
                {new Date(h.createdAt).toLocaleString('en-GB')} · {h.actorName} · {{ booked: 'Booked', prebooked: 'Pre-booked', marked: 'Marked', rescheduled: 'Rescheduled' }[h.action] ?? h.action}
                {h.partner && h.partner !== OWN_PARTNER ? ` · ${h.partner}` : ''}{h.date ? ` ${dmy(h.date)}` : ''}{h.vanName ? ` · Van: ${h.vanName}` : ''}{h.drop !== null ? ` · Drop ${h.drop}` : ''}{h.reason ? ` · ${h.reason}` : ''}
              </s-text>
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
