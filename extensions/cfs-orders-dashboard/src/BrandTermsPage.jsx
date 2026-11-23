import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useStaff } from './useStaff';
import Pager from './Pager.jsx';
import { rangeText } from './orderList';
import { TERMS_OPTIONS, loadBrandTerms, saveBrandTerms, termsFromValue } from './brandTerms';
import { MAX_IMPORT_BYTES, PAGE_SIZE, filterBrands, importBrandTerms, importSummary, pageOf, parseBrandTermsCsv } from './brandTermsImport';
import { loadReportLink } from './reports';

// Brand terms: for each brand, is the supplier paid on credit or pro-forma? The payment reports use this.
// Thousands of brands are expected, so there is a spreadsheet import, a download that doubles as the sample, a search and pages.
export default function BrandTermsPage() {
  const [brands, setBrands] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const dropZone = useRef(null);
  const staff = useStaff(); // undefined while checking, null when nobody can be verified

  const load = useCallback(async () => {
    const res = await loadBrandTerms();
    if (res.ok) { setBrands(res.brands); setError(null); } else setError(res.message);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function change(row, value) {
    const terms = termsFromValue(value);
    setBusy(row.brand);
    const res = await saveBrandTerms(row.brand, terms);
    setBusy(null);
    if (res.ok) {
      setBrands((all) => all.map((b) => (b.brand === row.brand ? { ...b, terms } : b)));
      setNotice({ tone: 'success', text: `${row.brand}: ${terms === 'credit' ? 'Credit' : terms === 'proforma' ? 'Pro-forma' : 'Not set'}.` });
    } else {
      setNotice({ tone: 'critical', text: res.message });
      load();
    }
  }

  async function download() {
    setBusy('download');
    const res = await loadReportLink('brandterms', null);
    setBusy(null);
    setNotice(res.ok
      ? { tone: 'success', text: 'The brand list is ready (the link works for 5 minutes). Fill in the Terms column, save it as CSV and import it below.', link: res.data }
      : { tone: 'critical', text: res.message });
  }

  async function importFile(event) {
    const zone = event.currentTarget;
    const file = zone.files?.[0];
    if (!file) return;
    setProblems([]);
    const clear = () => { try { zone.value = ''; } catch { /* the zone may already be gone */ } };
    if (file.size > MAX_IMPORT_BYTES) { setNotice({ tone: 'critical', text: 'That file is too big. Save the brand list as CSV and try again.' }); clear(); return; }
    setBusy('import');
    try {
      const parsed = parseBrandTermsCsv(await file.text());
      if (!parsed.ok) { setNotice({ tone: 'critical', text: parsed.message }); return; }
      const res = await importBrandTerms(parsed.rows);
      if (!res.ok) { setNotice({ tone: 'critical', text: res.message }); return; }
      setNotice({ tone: res.result.rejectedCount ? 'warning' : 'success', text: importSummary(res.result) });
      setProblems(res.result.rejected);
      await load();
    } catch {
      setNotice({ tone: 'critical', text: 'That file could not be read. Save it as CSV (comma separated) and try again.' });
    } finally {
      setBusy(null);
      clear();
    }
  }

  const shown = filterBrands(brands ?? [], search);
  const view = pageOf(shown, page);
  const total = brands?.length ?? 0;
  const setCount = (brands ?? []).filter((b) => b.terms).length;

  return (
    <s-page heading="Brand terms">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/reports">Reports</s-button>
      <s-button slot="secondary-actions" href="/">Orders</s-button>

      {error && <s-banner tone="critical" heading="Could not load the brands">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing brand terms needs a verified Shopify staff sign-in.</s-banner>}
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

      <s-section heading="Fill in many brands from a spreadsheet">
        <s-stack gap="base">
          <s-text>Choose how each brand's supplier is paid. The payment reports use this to decide which items we still owe money for.</s-text>
          <s-text>1. Download the brand list. 2. Open it in Excel and type Credit or Pro-forma next to each brand. 3. Save it as CSV and drop it below.</s-text>
          <s-text color="subdued">Leave Terms blank to keep a brand as it is. Type Clear to remove a brand's setting. Brands that are not in the list yet are added.</s-text>
          <s-stack direction="inline" gap="base">
            <s-button onClick={download} loading={busy === 'download' || undefined}>Download brand list (CSV)</s-button>
          </s-stack>
          <s-drop-zone ref={dropZone} label="Import brand terms (CSV)" accept=".csv" disabled={!staff || busy === 'import' || undefined} onChange={importFile} />
          {busy === 'import' && <s-text color="subdued">Importing...</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Brands">
        <s-stack gap="base">
          <s-search-field label="Search brands" placeholder="Type part of a brand name" value={search} onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }} />
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text>{brands === null ? 'Loading...' : `${rangeText(view.page, PAGE_SIZE, shown.length, false)}${search.trim() ? ' found' : ''}. ${setCount} of ${total} brands have terms.`}</s-text>
            {view.pageCount > 1 && <Pager page={view.page} pageCount={view.pageCount} all={false} onPage={setPage} />}
          </s-stack>
          {brands?.length === 0 && <s-text>No brands yet. They appear once orders have been saved.</s-text>}
          {brands && brands.length > 0 && shown.length === 0 && <s-text>No brand matches that search.</s-text>}
          {view.items.map((row) => (
            <s-stack key={row.brand} direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-text>{row.brand}</s-text>
              <s-select
                label={`Terms for ${row.brand}`}
                labelAccessibilityVisibility="exclusive"
                value={row.terms ?? ''}
                disabled={!staff || busy === row.brand || undefined}
                onChange={(e) => change(row, e.currentTarget.value)}
              >
                {TERMS_OPTIONS.map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
              </s-select>
            </s-stack>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
