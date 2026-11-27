import { useCallback, useEffect, useState } from 'react';
import { labelFor } from '../../extensions/cfs-order-status/src/statuses';
import EmptyState from './EmptyState.jsx';
import Pager from './Pager.jsx';
import { useStaff } from './useStaff';
import { formatDate, formatMoney, statusTone } from './orderList';
import { draftBatch, loadPayList, loadPayable, markPaid, payLink, removeFromPayList, saveDhdCost, saveInvoiceNo, saveManualCost, sendBatch, suggestInvoiceNo } from './paySupplier';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const pounds = (minor) => (minor == null ? '' : (minor / 100).toFixed(2));
const money = (minor) => (minor == null ? '—' : formatMoney(minor, 'GBP'));

// Pay To Supplier (paid=false: lines still to pay), Supplier Paid (paid=true: lines already paid, grouped by batch invoice number)
// and Supplier Payments (list=true: the signed-in person's own list, filled by Add To Accounts on the order page; Paid, Not Paid and Delete).
export default function PaySupplierPage({ paid = false, list = false }) {
  const staff = useStaff();
  const start = { paid, brand: '', q: '', page: 1, all: false };
  const [draft, setDraft] = useState(start);
  const [applied, setApplied] = useState(start);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false);
  const [busy, setBusy] = useState(null); // 'export' | 'paid' | 'unpaid' | 'search' | `${field}:${lineId}`
  const [picked, setPicked] = useState(new Set());
  const [edits, setEdits] = useState({}); // `${field}:${lineId}` -> text typed but not saved
  // Create Payment Batch & Draft Email (Pay To Supplier only): the invoice number typed, and the draft shown for review.
  const batching = !paid && !list;
  const [invoiceNo, setInvoiceNo] = useState(() => suggestInvoiceNo());
  const [batchDraft, setBatchDraft] = useState(null);
  const [batchKey, setBatchKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await (list ? loadPayList : loadPayable)(applied);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied, list]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setBatchDraft(null); }, [applied]);

  const rows = data?.rows ?? [];
  const canEdit = !!staff;
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const tick = (id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const go = (extra = {}) => { setApplied({ ...draft, page: 1, all: false, ...extra }); setPicked(new Set()); setLink(null); };
  const ticked = [...picked];
  const selectedTotal = rows.filter((r) => picked.has(r.lineId)).reduce((s, r) => s + (r.finalMinor ?? 0), 0);
  const valueOf = (field, r, saved) => edits[`${field}:${r.lineId}`] ?? saved;
  const edit = (field, r, text) => setEdits((e) => ({ ...e, [`${field}:${r.lineId}`]: text }));

  async function saveField(field, r, save, saved) {
    const key = `${field}:${r.lineId}`;
    setBusy(key);
    const res = await save(r.lineId, edits[key] ?? saved);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setEdits((e) => { const n = { ...e }; delete n[key]; return n; });
    setNotice({ tone: 'success', text: field === 'invoice' ? 'Invoice number saved.' : field === 'manual' ? 'Manual cost saved.' : 'DHD cost saved.' });
    await load();
  }

  async function setPaid(isPaid) {
    if (ticked.length === 0) { setNotice({ tone: 'warning', text: isPaid ? 'Select Record(s) to mark as paid.' : 'Select Record(s) to mark as unpaid.' }); return; }
    setBusy(isPaid ? 'paid' : 'unpaid');
    const res = await markPaid(ticked, isPaid);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const n = res.data.changed ?? ticked.length;
    setNotice({ tone: 'success', text: `${n} line${n === 1 ? '' : 's'} marked ${isPaid ? 'paid' : 'unpaid'}.` });
    setPicked(new Set());
    await load();
  }

  async function makeDraft() {
    if (!invoiceNo.trim()) { setNotice({ tone: 'warning', text: 'Please enter the supplier invoice number for this batch.' }); return; }
    if (ticked.length === 0) { setNotice({ tone: 'warning', text: 'Please select at least one order line to include in this batch.' }); return; }
    setBusy('draft');
    const res = await draftBatch(ticked, invoiceNo);
    setBusy(null);
    if (!res.ok) { setBatchDraft(null); setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice(null);
    setBatchDraft(res.data);
    setBatchKey(crypto.randomUUID());
  }

  async function confirmSend() {
    setBusy('send');
    const res = await sendBatch(batchDraft.lines.map((l) => l.lineId), batchDraft.invoiceNo, batchKey);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const d = res.data;
    const sentTo = d.recipients.filter((r) => !d.blocked?.includes(r));
    const batchText = `Batch created for invoice #${d.invoiceNo} (${d.lines} line${d.lines === 1 ? '' : 's'}, ${money(d.totalMinor)}).`;
    const emailText = d.mode === 'log'
      ? 'Email is in log mode, so the payment advice was recorded but not sent.'
      : `${sentTo.length ? `Payment advice ${d.duplicate ? 'was already sent' : 'sent'} to ${sentTo.join(', ')}.` : ''}${d.blocked?.length ? ` Test mode: ${d.blocked.join(', ')} ${d.blocked.length === 1 ? 'is' : 'are'} not an allowed test address, so ${d.blocked.length === 1 ? 'it was' : 'they were'} not emailed.` : ''}`;
    setNotice({ tone: d.blocked?.length || d.mode === 'log' ? 'warning' : 'success', text: `${batchText} ${emailText.trim()} Mark the lines Paid when the payment is made.` });
    setBatchDraft(null);
    setPicked(new Set());
    setInvoiceNo(suggestInvoiceNo());
    await load();
  }

  const [confirming, setConfirming] = useState(false);
  async function removeTicked() {
    setBusy('delete');
    const res = await removeFromPayList(ticked);
    setBusy(null);
    setConfirming(false);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    const n = res.data.removed ?? 0;
    setNotice({ tone: 'success', text: `${n} line${n === 1 ? '' : 's'} taken off your list.` });
    setPicked(new Set());
    await load();
  }

  async function download() {
    if (data && data.total === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no records match.' }); return; }
    if (ticked.length === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Please Select Record(s) to Export.' }); return; }
    setBusy('export');
    const res = await payLink(ticked);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  const title = list ? 'Supplier Payments' : paid ? 'Supplier Paid' : 'Pay To Supplier';
  const first = data && data.total > 0 ? (applied.all ? 1 : (data.page - 1) * data.size + 1) : 0;
  const last = data ? (applied.all ? data.total : Math.min(data.page * data.size, data.total)) : 0;
  const cancelEdit = (field, r) => setEdits((e) => { const n = { ...e }; delete n[`${field}:${r.lineId}`]; return n; });
  const field = (name, r, saved, save, placeholder) => {
    const key = `${name}:${r.lineId}`;
    const dirty = edits[key] !== undefined && edits[key] !== saved;
    return (
      <s-stack direction="inline" gap="small-300" alignItems="center">
        <s-text-field label={placeholder} labelAccessibilityVisibility="exclusive" value={valueOf(name, r, saved)} disabled={!canEdit || undefined} onInput={(e) => edit(name, r, e.currentTarget.value)} />
        {dirty && <s-button variant="primary" disabled={(busy && busy !== key) || undefined} loading={busy === key || undefined} onClick={() => saveField(name, r, save, saved)}>Save</s-button>}
        {dirty && busy !== key && <s-button onClick={() => cancelEdit(name, r)}>Undo</s-button>}
      </s-stack>
    );
  };

  return (
    <s-page heading={`${title}${data ? ` : (${data.total})` : ''}`}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      {list ? <s-button slot="secondary-actions" href="/pay-to-supplier">Pay To Supplier</s-button> : <s-button slot="secondary-actions" href={paid ? '/pay-to-supplier' : '/supplier-paid'}>{paid ? 'Pay To Supplier' : 'Supplier Paid'}</s-button>}
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing costs, invoice numbers and payments needs a verified Shopify staff sign-in.</s-banner>}
      {data?.costLookup === 'unavailable' && <s-banner tone="warning">Shopify could not be read for item costs just now, so costs show blank. Press Refresh to try again.</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && notice.text.startsWith('Your file') && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field label="Order No" placeholder="Search by Order No" value={draft.q} onInput={(e) => setDraft({ ...draft, q: e.currentTarget.value })} />
            {!list && <s-select label="Brand" value={draft.brand} onChange={(e) => { const brand = e.currentTarget.value; setDraft({ ...draft, brand }); setApplied({ ...draft, brand, page: 1, all: false }); setPicked(new Set()); setLink(null); }}>
              <s-option value="">All Brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>}
            <s-button onClick={() => go()}>Search</s-button>
            {(applied.q || applied.brand) && <s-button onClick={() => { setDraft(start); setApplied(start); setPicked(new Set()); setLink(null); }}>Reset</s-button>}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `${first} - ${last} Records Of ${data.total}` : 'Loading...'}</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={applied.all} onPage={(p) => { setApplied({ ...applied, page: p, all: false }); setPicked(new Set()); setLink(null); }} onAll={() => { setApplied({ ...applied, all: true }); setPicked(new Set()); setLink(null); }} />}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button disabled={(busy && busy !== 'export') || undefined} loading={busy === 'export' || undefined} onClick={download}>Export ticked</s-button>
            {list ? (
              <>
                <s-button variant="primary" disabled={!canEdit || (busy && busy !== 'paid') || undefined} loading={busy === 'paid' || undefined} onClick={() => setPaid(true)}>Paid</s-button>
                <s-button disabled={!canEdit || (busy && busy !== 'unpaid') || undefined} loading={busy === 'unpaid' || undefined} onClick={() => setPaid(false)}>Not Paid</s-button>
                <s-button tone="critical" disabled={!canEdit || busy || undefined} onClick={() => (ticked.length ? setConfirming(true) : setNotice({ tone: 'warning', text: 'Select Record(s) to delete.' }))}>Delete</s-button>
              </>
            ) : paid ? (
              <s-button tone="critical" disabled={!canEdit || (busy && busy !== 'unpaid') || undefined} loading={busy === 'unpaid' || undefined} onClick={() => setPaid(false)}>Mark Unpaid</s-button>
            ) : (
              <s-button variant="primary" disabled={!canEdit || (busy && busy !== 'paid') || undefined} loading={busy === 'paid' || undefined} onClick={() => setPaid(true)}>Mark Paid</s-button>
            )}
            {ticked.length > 0 && <s-text>Selected: {ticked.length} line{ticked.length === 1 ? '' : 's'}, total {money(selectedTotal)}</s-text>}
          </s-stack>
          {batching && (applied.brand ? (
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-text-field label="Supplier invoice number for this batch" value={invoiceNo} disabled={!canEdit || undefined} onInput={(e) => setInvoiceNo(e.currentTarget.value)} />
              <s-button disabled={!canEdit || undefined} onClick={() => setInvoiceNo(suggestInvoiceNo())}>New number</s-button>
              <s-button variant="primary" disabled={!canEdit || (busy && busy !== 'draft') || undefined} loading={busy === 'draft' || undefined} onClick={makeDraft}>Create Payment Batch &amp; Draft Email</s-button>
            </s-stack>
          ) : (
            <s-text color="subdued">Select a specific brand above to create a payment batch (one email goes to one supplier).</s-text>
          ))}
        </s-stack>
      </s-section>

      {batchDraft && (
        <s-section heading={`Payment Batch Draft — Invoice #${batchDraft.invoiceNo}`}>
          <s-stack gap="base">
            <s-stack gap="small-300">
              <s-text><s-text type="strong">Supplier:</s-text> {batchDraft.brand}</s-text>
              <s-text><s-text type="strong">To:</s-text> {batchDraft.recipients.join(', ')}</s-text>
            </s-stack>
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Order No</s-table-header>
                <s-table-header>Item</s-table-header>
                <s-table-header format="numeric">Qty</s-table-header>
                <s-table-header format="numeric">Cost</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {batchDraft.lines.map((l) => (
                  <s-table-row key={l.lineId}>
                    <s-table-cell>{l.orderName}</s-table-cell>
                    <s-table-cell>{l.variantTitle ? `${l.title} - ${l.variantTitle}` : l.title}</s-table-cell>
                    <s-table-cell>{l.quantity}</s-table-cell>
                    <s-table-cell>{money(l.costMinor)}</s-table-cell>
                  </s-table-row>
                ))}
                <s-table-row>
                  <s-table-cell></s-table-cell>
                  <s-table-cell></s-table-cell>
                  <s-table-cell><s-text type="strong">Total</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(batchDraft.totalMinor)}</s-text></s-table-cell>
                </s-table-row>
              </s-table-body>
            </s-table>
            <s-text color="subdued">Sending puts invoice #{batchDraft.invoiceNo} on these lines and emails the supplier this payment advice. It does not mark them paid.</s-text>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" disabled={(busy && busy !== 'send') || undefined} loading={busy === 'send' || undefined} onClick={confirmSend}>Confirm &amp; Send Email</s-button>
              <s-button disabled={busy === 'send' || undefined} onClick={() => setBatchDraft(null)}>Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {confirming && (
        <s-banner tone="critical" heading={`Take ${ticked.length} line${ticked.length === 1 ? '' : 's'} off your list?`}>
          <s-stack direction="inline" gap="base">
            <s-text>The order lines and their payment details are kept; only your list changes.</s-text>
            <s-button tone="critical" disabled={(busy && busy !== 'delete') || undefined} loading={busy === 'delete' || undefined} onClick={removeTicked}>Yes, delete</s-button>
            <s-button disabled={busy || undefined} onClick={() => setConfirming(false)}>Cancel</s-button>
          </s-stack>
        </s-banner>
      )}

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title={list ? 'Your list is empty' : paid ? 'No paid lines' : 'Nothing to pay'} hint={list ? 'Open an order, tick its items and press Add To Accounts to put them here.' : paid ? 'Lines marked paid will appear here.' : 'Lines that still need paying to a supplier will appear here.'} />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.lineId)) : new Set())} /></s-table-header>
              {!list && <s-table-header>Batch Invoice No.</s-table-header>}
              {!list && <s-table-header listSlot="primary">Date</s-table-header>}
              <s-table-header listSlot={list ? 'primary' : undefined}>OrderNo</s-table-header>
              {!paid && !list && <s-table-header>Status</s-table-header>}
              <s-table-header>Brand</s-table-header>
              <s-table-header>Item</s-table-header>
              {(paid || list) && <s-table-header>Code</s-table-header>}
              <s-table-header format="numeric">Qty</s-table-header>
              {list && <s-table-header format="numeric">Cost</s-table-header>}
              <s-table-header format="numeric">Final Cost</s-table-header>
              {!paid && <s-table-header format="numeric">Cost Diff.</s-table-header>}
              {!paid && <s-table-header>Update Cost</s-table-header>}
              {!paid && <s-table-header>DHD Cost</s-table-header>}
              {!paid && <s-table-header format="numeric">Final Sale Price</s-table-header>}
              <s-table-header>{paid ? 'Supplier Invoice No.' : 'Invoice No.'}</s-table-header>
              {paid && <s-table-header>Paid Date</s-table-header>}
              {list && <s-table-header>Paid/NotPaid</s-table-header>}
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.lineId}>
                  <s-table-cell><s-checkbox label={`Select ${r.orderName}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={(e) => tick(r.lineId, e.currentTarget.checked)} /></s-table-cell>
                  {!list && <s-table-cell>{r.batchInvoiceNo || '—'}</s-table-cell>}
                  {!list && <s-table-cell>{formatDate(r.orderDate)}</s-table-cell>}
                  <s-table-cell><s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link></s-table-cell>
                  {!paid && !list && <s-table-cell>{r.statusId != null ? <s-badge tone={statusTone(r.statusId)}>{labelFor(r.statusId)}</s-badge> : ''}</s-table-cell>}
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{r.variantTitle ? <s-stack direction="block" gap="small-500"><s-text>{r.title}</s-text><s-text color="subdued">{r.variantTitle}</s-text></s-stack> : r.title}</s-table-cell>
                  {(paid || list) && <s-table-cell>{r.code}</s-table-cell>}
                  <s-table-cell>{r.quantity}</s-table-cell>
                  {list && <s-table-cell>{money(r.calculatedMinor)}</s-table-cell>}
                  <s-table-cell><s-text type="strong">{money(r.finalMinor)}</s-text></s-table-cell>
                  {!paid && <s-table-cell>{r.diffMinor == null ? '' : money(r.diffMinor)}</s-table-cell>}
                  {!paid && <s-table-cell>{field('manual', r, pounds(r.manualMinor), saveManualCost, 'Manual cost')}</s-table-cell>}
                  {!paid && <s-table-cell>{field('dhd', r, pounds(r.dhdMinor), saveDhdCost, 'DHD cost')}</s-table-cell>}
                  {!paid && <s-table-cell>{money(r.saleMinor)}</s-table-cell>}
                  <s-table-cell>{paid ? r.invoiceNumber || '—' : field('invoice', r, r.invoiceNumber, saveInvoiceNo, 'Supplier invoice number')}</s-table-cell>
                  {paid && <s-table-cell>{r.paidAt ? formatDate(r.paidAt) : '—'}</s-table-cell>}
                  {list && <s-table-cell><s-badge tone={r.paid ? 'success' : 'neutral'}>{r.paid ? 'Paid' : 'Not Paid'}</s-badge></s-table-cell>}
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      {data && rows.length > 0 && (
        <s-section>
          <s-text type="strong">Page Total ({rows.length} lines): {money(data.pageTotalMinor)}</s-text>
        </s-section>
      )}
    </s-page>
  );
}
