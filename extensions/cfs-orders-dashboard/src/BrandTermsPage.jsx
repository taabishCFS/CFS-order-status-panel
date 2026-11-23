import { useCallback, useEffect, useState } from 'preact/hooks';
import { useStaff } from './useStaff';
import { TERMS_OPTIONS, loadBrandTerms, saveBrandTerms, termsFromValue } from './brandTerms';

// Brand terms: for each brand, is the supplier paid on credit or pro-forma? The payment reports use this.
export default function BrandTermsPage() {
  const [brands, setBrands] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
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

  return (
    <s-page heading="Brand terms">
      <s-button slot="secondary-actions" href="/dashboard">Dashboard</s-button>
      <s-button slot="secondary-actions" href="/reports">Reports</s-button>
      <s-button slot="secondary-actions" href="/">Orders</s-button>

      {error && <s-banner tone="critical" heading="Could not load the brands">{error}</s-banner>}
      {staff === null && <s-banner tone="warning">Changing brand terms needs a verified Shopify staff sign-in.</s-banner>}
      {notice && <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>{notice.text}</s-banner>}

      <s-section>
        <s-text>Choose how each brand's supplier is paid. The payment reports use this to decide which items we still owe money for.</s-text>
      </s-section>

      <s-section heading="Brands">
        {brands === null && !error && <s-text>Loading...</s-text>}
        {brands?.length === 0 && <s-text>No brands yet. They appear once orders have been saved.</s-text>}
        <s-stack gap="base">
          {brands?.map((row) => (
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
