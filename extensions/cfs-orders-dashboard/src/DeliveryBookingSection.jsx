import { useCallback, useEffect, useState } from 'preact/hooks';
import { useStaff } from './useStaff';
import { bookLines, bookedText, bookingLine, checkDrop, dropNumbers, loadOrderDelivery, rescheduleLines, rescheduledText } from './delivery';

const EMPTY = { date: '', vanId: '', driverId: '', slotId: '', drop: '', amPm: '' };

// Delivery Booking on an order: set the date, van, driver, drop and AM/PM for the ticked items, or reschedule them.
// `id` is the numeric order id; `picked` is the ticked line ids.
export default function DeliveryBookingSection({ id, lines, picked, setNotice }) {
  const staff = useStaff();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [warn, setWarn] = useState([]); // order names already holding this date, van and drop
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [reason, setReason] = useState('');
  const [emailIt, setEmailIt] = useState(true);

  const load = useCallback(async () => {
    const res = await loadOrderDelivery(id);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setWarn([]); };
  const none = picked.length === 0;
  const ready = !none && form.date && (!form.drop || form.vanId);
  const bookedPicked = (data?.bookings ?? []).filter((b) => picked.includes(b.lineId));

  async function checkAndBook(allowDuplicate) {
    setBusy(true);
    if (!allowDuplicate && form.vanId && form.drop) {
      const chk = await checkDrop(id, picked, form);
      if (chk.ok && chk.duplicates.length > 0) { setWarn(chk.duplicates); setBusy(false); return; }
    }
    const res = await bookLines(id, picked, form, allowDuplicate);
    setBusy(false);
    if (!res.ok) { if (res.duplicate) setWarn(res.duplicates ?? []); else setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: 'success', text: bookedText(res) });
    setForm(EMPTY);
    setWarn([]);
    await load();
  }

  async function reschedule() {
    setBusy(true);
    const res = await rescheduleLines(id, bookedPicked.map((b) => b.lineId), reason, emailIt);
    setBusy(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: res.data.email === 'queued' || res.data.email === 'not_requested' ? 'success' : 'warning', text: rescheduledText(res.data) });
    setRescheduling(false);
    setReason('');
    await load();
  }

  const fleet = data?.fleet ?? { drivers: [], vans: [], slots: [] };
  const nameOf = (lineId) => lines.find((l) => l.id === lineId)?.title ?? 'Item';

  return (
    <s-section heading="Delivery Booking">
      <s-stack gap="base">
        {error && <s-banner tone="critical" dismissible onDismiss={() => setError(null)}>{error}</s-banner>}
        {staff === null && <s-banner tone="warning">Booking a delivery needs a verified Shopify staff sign-in.</s-banner>}

        {data && data.bookings.length > 0 && (
          <s-stack gap="small-200">
            <s-text type="strong">Booked</s-text>
            {data.bookings.map((b) => <s-text key={b.lineId}>{nameOf(b.lineId)}: {bookingLine(b)}</s-text>)}
          </s-stack>
        )}

        <s-text color="subdued">Tick the items in the Items table, then choose the delivery details.</s-text>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
          <s-date-field label="Delivery date" value={form.date} onChange={(e) => set({ date: e.currentTarget.value })} />
          <s-select label="Van" value={form.vanId} onChange={(e) => set({ vanId: e.currentTarget.value, ...(e.currentTarget.value ? {} : { drop: '' }) })}>
            <s-option value="">No van</s-option>
            {fleet.vans.map((v) => <s-option key={v.id} value={v.id}>{v.name}</s-option>)}
          </s-select>
          <s-select label="Driver" value={form.driverId} onChange={(e) => set({ driverId: e.currentTarget.value })}>
            <s-option value="">No driver</s-option>
            {fleet.drivers.map((d) => <s-option key={d.id} value={d.id}>{d.name}</s-option>)}
          </s-select>
          <s-select label="Drop" value={form.drop} disabled={!form.vanId || undefined} onChange={(e) => set({ drop: e.currentTarget.value })}>
            <s-option value="">No drop</s-option>
            {dropNumbers().map((n) => <s-option key={n} value={String(n)}>{n}</s-option>)}
          </s-select>
          <s-select label="AM / PM" value={form.amPm} onChange={(e) => set({ amPm: e.currentTarget.value })}>
            <s-option value="">Not set</s-option>
            <s-option value="AM">AM</s-option>
            <s-option value="PM">PM</s-option>
          </s-select>
          <s-select label="Delivery slot" value={form.slotId} onChange={(e) => set({ slotId: e.currentTarget.value })}>
            <s-option value="">No slot</s-option>
            {fleet.slots.map((s) => <s-option key={s.id} value={s.id}>{s.name}</s-option>)}
          </s-select>
        </s-grid>
        {form.amPm === 'PM' && form.drop && <s-text color="subdued">PM on a drop also moves every later drop on this van and day to PM.</s-text>}
        {fleet.vans.length === 0 && <s-text color="subdued">No vans yet. Add vans, drivers and slots on the <s-link href="/van-management">Van Management</s-link> page.</s-text>}

        {warn.length > 0 && (
          <s-banner tone="warning" heading="This drop is already taken">
            {warn.join(', ')} already {warn.length === 1 ? 'has' : 'have'} this van and drop on that day.
            <s-button slot="primary-action" disabled={busy || undefined} onClick={() => checkAndBook(true)}>Book anyway</s-button>
            <s-button slot="secondary-actions" onClick={() => setWarn([])}>Change it</s-button>
          </s-banner>
        )}

        <s-stack direction="inline" gap="base">
          <s-button variant="primary" disabled={!ready || !staff || busy || undefined} loading={busy || undefined} onClick={() => checkAndBook(false)}>Book delivery</s-button>
          <s-button tone="critical" disabled={bookedPicked.length === 0 || !staff || busy || undefined} onClick={() => setRescheduling(true)}>Reschedule ticked items</s-button>
        </s-stack>

        {rescheduling && (
          <s-banner tone="warning" heading={`Reschedule ${bookedPicked.length} item${bookedPicked.length === 1 ? '' : 's'}?`}>
            <s-stack gap="small">
              <s-text>This clears their booking so they can be booked again.</s-text>
              <s-text-field label="Reason (the customer is told this)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
              <s-checkbox label="Email the customer" checked={emailIt} onChange={(e) => setEmailIt(e.currentTarget.checked)} />
            </s-stack>
            <s-button slot="primary-action" disabled={!reason.trim() || busy || undefined} loading={busy || undefined} onClick={reschedule}>Reschedule</s-button>
            <s-button slot="secondary-actions" onClick={() => setRescheduling(false)}>Cancel</s-button>
          </s-banner>
        )}

        {data && data.history.length > 0 && (
          <s-stack gap="small-200">
            <s-text type="strong">Delivery history</s-text>
            {data.history.slice(0, 10).map((h) => (
              <s-text key={h.id} color="subdued">
                {new Date(h.createdAt).toLocaleString('en-GB')} · {h.actorName} · {h.action === 'booked' ? 'Booked' : 'Rescheduled'}
                {h.date ? ` ${h.date.split('-').reverse().join('/')}` : ''}{h.vanName ? ` · Van ${h.vanName}` : ''}{h.drop !== null ? ` · Drop ${h.drop}` : ''}{h.reason ? ` · ${h.reason}` : ''}
              </s-text>
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
