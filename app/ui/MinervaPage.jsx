import { useCallback, useEffect, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import { formatMoney } from './orderList';
import { discText, loadMinerva, minervaLink, periodText, removeMinervaBrand, saveMinervaBrand } from './minerva';

const money = (minor) => formatMoney(minor, 'GBP');
const blankForm = { brand: '', disc: '', from: '', to: '' };

// Minerva Supplier Orders (old Accounts menu). Some brands ("Minerva suppliers") give a discount on what we pay them between two dates.
// When one of their items is marked Paid (Supplier Payments or Pay To Supplier), the manual cost is recorded; this report adds it up per
// brand: paid inside the dates (Applicable) and outside them (Not Applicable), with the discount due. The old app set Minerva brands on its
// brand page; here they are set at the bottom of this page.
export default function MinervaPage() {
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshClicked, setRefreshClicked] = useState(false);
  const [busy, setBusy] = useState(null); // 'download' | 'save' | `remove:${brand}`
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadMinerva(applied.from, applied.to);
    setLoading(false);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.message);
  }, [applied]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const filtered = applied.from || applied.to;
  const apply = (next) => { setApplied(next); setLink(null); };

  async function download() {
    if (rows.length === 0) { setLink(null); setNotice({ tone: 'warning', text: 'Nothing to download: no records match.' }); return; }
    setBusy('download');
    const res = await minervaLink(applied.from, applied.to);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(res.data);
    setNotice({ tone: 'success', text: 'Your file is ready (the link works for 5 minutes).' });
  }

  async function save() {
    setBusy('save');
    const res = await saveMinervaBrand(form.brand, form.disc, form.from, form.to);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(null);
    setNotice({ tone: 'success', text: `${form.brand} is a Minerva supplier: ${form.disc.replace('%', '')}% from ${periodText({ fromDate: form.from, toDate: form.to })}.` });
    setForm(blankForm);
    load();
  }

  async function remove(brand) {
    setBusy(`remove:${brand}`);
    const res = await removeMinervaBrand(brand);
    setBusy(null);
    if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
    setLink(null);
    setNotice({ tone: 'success', text: `${brand} is no longer a Minerva supplier. Items already paid stay on the report.` });
    load();
  }

  const edit = (b) => setForm({ brand: b.brand, disc: discText(b.discHundredths), from: b.fromDate, to: b.toDate });
  const brandChoices = data ? [...new Set([...data.allBrands, ...data.brands.map((b) => b.brand)])].sort((a, b) => a.localeCompare(b)) : [];

  return (
    <s-page heading="Minerva Supplier Orders">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="primary-action" onClick={async () => { setRefreshClicked(true); try { await load(); } finally { setRefreshClicked(false); } }} loading={(loading && refreshClicked) || undefined}>Refresh</s-button>
      {error && <s-banner tone="critical" heading="Could not load the report">{error}</s-banner>}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          {notice.text}
          {link && notice.tone === 'success' && <s-link href={link.url} target="_blank">Download the file</s-link>}
        </s-banner>
      )}

      <s-section>
        <s-stack gap="base">
          <s-paragraph>Dates are the day the items were marked Paid to the supplier.</s-paragraph>
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-date-field label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <s-date-field label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            <s-button onClick={() => apply(draft)}>Go</s-button>
            {filtered && <s-button onClick={() => { const none = { from: '', to: '' }; setDraft(none); apply(none); }}>Reset</s-button>}
          </s-stack>
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{data ? `${rows.length} ${rows.length === 1 ? 'brand' : 'brands'}` : 'Loading...'}</s-text>
            <s-button disabled={busy === 'download' || undefined} loading={busy === 'download' || undefined} onClick={download}>Download</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {data && rows.length === 0 ? (
          <EmptyState title="No records" hint="A brand appears here once one of its items is marked Paid while it is a Minerva supplier (set below)." />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Brand</s-table-header>
              <s-table-header format="numeric">Applicable Order Amount</s-table-header>
              <s-table-header format="numeric">Not Applicable Order Amount</s-table-header>
              <s-table-header format="numeric">Discount %</s-table-header>
              <s-table-header format="numeric">Amount</s-table-header>
              <s-table-header format="numeric">Amount Not Eligible</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.brand}>
                  <s-table-cell>{r.brand}</s-table-cell>
                  <s-table-cell>{money(r.applicableMinor)}</s-table-cell>
                  <s-table-cell>{money(r.notApplicableMinor)}</s-table-cell>
                  <s-table-cell>{discText(r.discHundredths)}</s-table-cell>
                  <s-table-cell>{money(r.amountMinor)}</s-table-cell>
                  <s-table-cell>{money(r.notEligibleMinor)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Minerva brands">
        <s-stack gap="base">
          <s-paragraph>A Minerva brand gives a discount on what we pay it between two dates. Only items marked Paid while the brand is set here are recorded.</s-paragraph>
          {data && data.brands.length > 0 && (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Brand</s-table-header>
                <s-table-header format="numeric">Discount %</s-table-header>
                <s-table-header>Dates</s-table-header>
                <s-table-header>Changed by</s-table-header>
                <s-table-header></s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.brands.map((b) => (
                  <s-table-row key={b.brand}>
                    <s-table-cell>{b.brand}</s-table-cell>
                    <s-table-cell>{discText(b.discHundredths)}</s-table-cell>
                    <s-table-cell>{periodText(b)}</s-table-cell>
                    <s-table-cell>{b.updatedByName ?? '—'}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small">
                        <s-button onClick={() => edit(b)}>Edit</s-button>
                        <s-button tone="critical" disabled={busy === `remove:${b.brand}` || undefined} loading={busy === `remove:${b.brand}` || undefined} onClick={() => remove(b.brand)}>Remove</s-button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-select label="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.currentTarget.value })}>
              <s-option value="">-- Choose a brand --</s-option>
              {brandChoices.map((b) => <s-option key={b} value={b}>{b}</s-option>)}
            </s-select>
            <s-text-field label="Minerva Disc. %" value={form.disc} onInput={(e) => setForm({ ...form, disc: e.currentTarget.value })} />
            <s-date-field label="From" value={form.from} onChange={(e) => setForm({ ...form, from: e.currentTarget.value })} />
            <s-date-field label="To" value={form.to} onChange={(e) => setForm({ ...form, to: e.currentTarget.value })} />
            <s-button variant="primary" disabled={busy === 'save' || !form.brand || undefined} loading={busy === 'save' || undefined} onClick={save}>Save</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}
