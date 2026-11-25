import { useCallback, useEffect, useState } from 'preact/hooks';
import { resolveActor } from '../../cfs-order-status/src/identity';
import { labelFor } from '../../cfs-order-status/src/statuses';
import { useStaff } from './useStaff';
import { bulkExpectedDate } from './bulk';
import Pager from './Pager.jsx';
import { formatDate, rangeText, statusTone, toggleAll, toggleOne } from './orderList';
import { callProcess, loadChase, loadChaseExport, processText } from './supplierChase';

const orderUrl = (gid) => `/orders/${gid.split('/').pop()}`;
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');
const todayIso = () => new Date().toISOString().slice(0, 10);

const COPY = {
  chaseup: {
    heading: 'Supplier Chaseup',
    intro: 'Lines in Order in Progress, Delayed, Service Issue or Part Order Delivered with an expected date. With no dates chosen, it shows lines due in three days. Choose a brand, tick lines and press Chaseup to email the supplier.',
  },
  lapsed: {
    heading: 'Date Lapsed',
    intro: 'Lines whose expected date has passed (or is today) and are still Order in Progress, Delayed, Invoice Paid, Due In Stock or Service Issue.',
  },
};

// Supplier Chaseup and Date Lapsed: lines to chase with suppliers. `kind` is "chaseup" or "lapsed".
export default function SupplierChasePage({ kind = 'chaseup' }) {
  const copy = COPY[kind];
  const [draft, setDraft] = useState({ brand: '', from: '', to: '' });
  const [applied, setApplied] = useState({ brand: '', from: '', to: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const staff = useStaff();
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadChase({ kind, ...applied });
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
    setPicked(new Set());
    setLoading(false);
  }, [kind, applied]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.lineId));
  const go = () => setApplied({ ...draft, page: 1 });
  const actor = () => { try { return resolveActor(staff ?? null, name); } catch (e) { setNotice({ tone: 'warning', text: e.message }); return null; } };

  async function chase() {
    setBusy('chase');
    setNotice(null);
    const res = await callProcess({ action: 'chaseup', lineIds: [...picked], key: crypto.randomUUID(), dryRun: false });
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setNotice({ tone: res.data.noSupplier.length ? 'warning' : 'success', text: processText('chaseup', res.data) });
    await load();
  }

  async function saveDate(row, date) {
    const who = actor();
    if (!who) return;
    setBusy(row.lineId);
    const result = await bulkExpectedDate({ groups: new Map([[row.orderId, [row.lineId]]]), date: date || null, actor: who });
    setBusy(null);
    setNotice(result.failed.length ? { tone: 'critical', text: `${row.orderName}: ${result.failed[0].message}` } : { tone: 'success', text: `Expected date saved for ${row.orderName}.` });
    await load();
  }

  async function download() {
    setBusy('export');
    const res = await loadChaseExport({ kind, ...applied });
    setBusy(null);
    setNotice(res.ok ? { tone: 'success', text: 'The CSV is ready (the link works for 5 minutes).', link: res.data } : { tone: 'critical', text: res.message });
  }

  return (
    <s-page heading={copy.heading}>
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/suppliers">Suppliers</s-button>
      <s-button slot="secondary-actions" href={kind === 'chaseup' ? '/date-lapsed' : '/supplier-chaseup'}>{kind === 'chaseup' ? 'Date Lapsed' : 'Supplier Chaseup'}</s-button>
      <s-button slot="primary-action" onClick={load} loading={loading || undefined}>Refresh</s-button>

      {error && <s-banner tone="critical" heading="Could not load the list">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.link && <s-link href={notice.link.url} target="_blank">Download {notice.link.filename}</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-text color="subdued">{copy.intro}</s-text>
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Brand" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.currentTarget.value })}>
              <s-option value="">All brands</s-option>
              {(data?.brands ?? []).map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-date-field label="Expected from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="Expected to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button variant="primary" onClick={go}>Go</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? rangeText(data.page, 50, data.total, false) : 'Loading...'} · {picked.size} selected</s-text>
            {data && data.pageCount > 1 && <Pager page={data.page} pageCount={data.pageCount} all={false} onPage={(page) => setApplied((a) => ({ ...a, page }))} />}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="end">
            {kind === 'chaseup' && (
              <s-button variant="primary" disabled={!applied.brand || picked.size === 0 || busy !== null || staff === undefined || undefined} loading={busy === 'chase' || undefined} onClick={chase}>Chaseup</s-button>
            )}
            <s-button disabled={busy !== null || undefined} loading={busy === 'export' || undefined} onClick={download}>Download CSV</s-button>
            {staff === null && <s-text-field label="Your name (not verified)" value={name} onInput={(e) => setName(e.currentTarget.value)} />}
          </s-stack>
          {kind === 'chaseup' && !applied.brand && <s-text color="subdued">Choose a brand and press Go to enable Chaseup.</s-text>}
        </s-stack>
      </s-section>

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header><s-checkbox label="Select all" labelAccessibilityVisibility="exclusive" checked={allPicked} onChange={() => setPicked(toggleAll(picked, rows))} /></s-table-header>
            <s-table-header listSlot="primary">Order</s-table-header>
            <s-table-header>Item</s-table-header>
            <s-table-header>Expected</s-table-header>
            {kind === 'chaseup' && <s-table-header>Update expected date</s-table-header>}
            {kind === 'chaseup' && <s-table-header>Last chaseup</s-table-header>}
            <s-table-header>Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => (
              <s-table-row key={r.lineId}>
                <s-table-cell><s-checkbox label={`Select ${r.product}`} labelAccessibilityVisibility="exclusive" checked={picked.has(r.lineId)} onChange={() => setPicked(toggleOne(picked, r.lineId))} /></s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="small-500">
                    <s-link href={orderUrl(r.orderId)}>{r.orderName}</s-link>
                    <s-text color="subdued">{formatDate(r.orderCreatedAt)}</s-text>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="small-500">
                    <s-text>{r.product} x {r.quantity}</s-text>
                    <s-text color="subdued">{[r.brand, r.variantTitle].filter(Boolean).join(' · ')}</s-text>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>{dmy(r.expectedDate)}</s-table-cell>
                {kind === 'chaseup' && (
                  <s-table-cell>
                    <s-date-field label="New date" labelAccessibilityVisibility="exclusive" value={r.expectedDate ?? ''} disabled={busy !== null || undefined} onChange={(e) => saveDate(r, e.currentTarget.value)} />
                  </s-table-cell>
                )}
                {kind === 'chaseup' && (
                  <s-table-cell>
                    {r.lastChasedAt ? <s-text tone={r.lastChasedAt.slice(0, 10) === todayIso() ? 'critical' : 'neutral'}>{formatDate(r.lastChasedAt)}</s-text> : <s-text color="subdued">Never</s-text>}
                  </s-table-cell>
                )}
                <s-table-cell>{r.lineStatusId != null ? <s-badge tone={statusTone(r.lineStatusId)}>{labelFor(r.lineStatusId)}</s-badge> : <s-text color="subdued">Not set</s-text>}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {!loading && rows.length === 0 && !error && <s-box padding="base"><s-text>No lines match.</s-text></s-box>}
      </s-section>
      {loading && !data && <s-spinner accessibilityLabel="Loading lines" />}
    </s-page>
  );
}
